import { Router, Request, Response } from 'express';
import { query } from '../db/connection';
import { authenticateToken, requireRole } from '../middleware/auth';
import { recordAuditLog } from '../utils/audit';

export const rolesRouter = Router();

export async function ensureRolesSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) UNIQUE NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      description TEXT,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_system BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);

  // Default system and standard roles
  const defaultRoles = [
    {
      name: 'admin',
      display_name: 'Administrator',
      description: 'Full system control, catalog management, role & user controls, and settings',
      is_system: true,
      permissions: {
        'quotations.create': true,
        'quotations.edit': true,
        'quotations.approve': true,
        'quotations.delete': true,
        'quotations.export': true,
        'catalog.view': true,
        'catalog.manage': true,
        'customers.manage': true,
        'payments.view': true,
        'payments.record': true,
        'reports.view': true,
        'targets.manage': true,
        'company.manage': true,
        'audit.view': true,
        'backup.manage': true,
        'admin.access': true,
        'dispatch.view': true,
        'dispatch.manage': true,
      },
    },
    {
      name: 'salesperson',
      display_name: 'Sales Associate',
      description: 'Create quotations, browse catalogs & manage customer interactions',
      is_system: true,
      permissions: {
        'quotations.create': true,
        'quotations.edit': true,
        'quotations.approve': false,
        'quotations.delete': false,
        'quotations.export': true,
        'catalog.view': true,
        'catalog.manage': false,
        'customers.manage': true,
        'payments.view': false,
        'payments.record': false,
        'reports.view': false,
        'targets.manage': false,
        'company.manage': false,
        'audit.view': false,
        'backup.manage': false,
        'admin.access': false,
      },
    },
    {
      name: 'manager',
      display_name: 'Store Manager',
      description: 'Quotation approvals, pricing adjustments, team performance & reports',
      is_system: false,
      permissions: {
        'quotations.create': true,
        'quotations.edit': true,
        'quotations.approve': true,
        'quotations.delete': false,
        'quotations.export': true,
        'catalog.view': true,
        'catalog.manage': true,
        'customers.manage': true,
        'payments.view': true,
        'payments.record': false,
        'reports.view': true,
        'targets.manage': true,
        'company.manage': false,
        'audit.view': true,
        'backup.manage': false,
        'admin.access': false,
        'dispatch.view': true,
        'dispatch.manage': true,
      },
    },
    {
      name: 'dispatch',
      display_name: 'Dispatch Team',
      description: 'Track closed quotations, manage item dispatch readiness, factory orders & delivery dates',
      is_system: false,
      permissions: {
        'quotations.create': false,
        'quotations.edit': false,
        'quotations.approve': false,
        'quotations.delete': false,
        'quotations.export': true,
        'catalog.view': true,
        'catalog.manage': false,
        'customers.manage': false,
        'payments.view': false,
        'payments.record': false,
        'reports.view': false,
        'targets.manage': false,
        'company.manage': false,
        'audit.view': false,
        'backup.manage': false,
        'admin.access': false,
        'dispatch.view': true,
        'dispatch.manage': true,
      },
    },
    {
      name: 'accounts',
      display_name: 'Accounts & Finance',
      description: 'Payment receipts, financial clearance, billing & quotation register export',
      is_system: false,
      permissions: {
        'quotations.create': false,
        'quotations.edit': false,
        'quotations.approve': false,
        'quotations.delete': false,
        'quotations.export': true,
        'catalog.view': true,
        'catalog.manage': false,
        'customers.manage': false,
        'payments.view': true,
        'payments.record': true,
        'reports.view': true,
        'targets.manage': false,
        'company.manage': false,
        'audit.view': false,
        'backup.manage': false,
        'admin.access': false,
      },
    },
  ];

  for (const r of defaultRoles) {
    await query(
      `INSERT INTO roles (name, display_name, description, permissions, is_system)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (name) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           description = EXCLUDED.description,
           is_system = EXCLUDED.is_system`,
      [r.name, r.display_name, r.description, JSON.stringify(r.permissions), r.is_system]
    );
  }
}

// All role endpoints require authentication and admin access
rolesRouter.use(authenticateToken);

// List all roles with associated user counts
rolesRouter.get('/', async (req: Request, res: Response) => {
  try {
    await ensureRolesSchema();
    const rows = await query(`
      SELECT 
        r.id,
        r.name,
        r.display_name,
        r.description,
        r.permissions,
        r.is_system,
        r.created_at,
        r.updated_at,
        COUNT(u.id)::int as user_count
      FROM roles r
      LEFT JOIN users u ON u.role = r.name
      GROUP BY r.id, r.name, r.display_name, r.description, r.permissions, r.is_system, r.created_at, r.updated_at
      ORDER BY 
        CASE WHEN r.name = 'admin' THEN 0 WHEN r.name = 'salesperson' THEN 1 ELSE 2 END,
        r.display_name ASC
    `);

    res.json({ roles: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new role (Admin only)
rolesRouter.post('/', requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { name, display_name, description, permissions = {} } = req.body;

    if (!name || !display_name) {
      res.status(400).json({ error: 'Role name and display name are required' });
      return;
    }

    const cleanSlug = String(name).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');

    // Check if role name already exists
    const existing = await query('SELECT id FROM roles WHERE LOWER(name) = LOWER($1)', [cleanSlug]);
    if (existing.length > 0) {
      res.status(409).json({ error: `Role '${cleanSlug}' already exists` });
      return;
    }

    const rows = await query(
      `INSERT INTO roles (name, display_name, description, permissions, is_system)
       VALUES ($1, $2, $3, $4::jsonb, false)
       RETURNING id, name, display_name, description, permissions, is_system, created_at`,
      [cleanSlug, String(display_name).trim(), description ? String(description).trim() : null, JSON.stringify(permissions)]
    );

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'ROLE_CREATED',
      entityType: 'role',
      entityId: rows[0].id,
      details: { name: cleanSlug, display_name },
      ipAddress: req.ip,
    });

    res.status(201).json({ role: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update role details and permission settings (Admin only)
rolesRouter.put('/:id', requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.id as string, 10);
    const { display_name, description, permissions } = req.body;

    const roleRows = await query('SELECT * FROM roles WHERE id = $1', [roleId]);
    if (roleRows.length === 0) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    const role = roleRows[0];

    const updatedPermissions = permissions !== undefined ? JSON.stringify(permissions) : JSON.stringify(role.permissions || {});
    const updatedDisplayName = display_name !== undefined ? String(display_name).trim() : role.display_name;
    const updatedDescription = description !== undefined ? String(description).trim() : role.description;

    const rows = await query(
      `UPDATE roles 
       SET display_name = $1, description = $2, permissions = $3::jsonb, updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, display_name, description, permissions, is_system, updated_at`,
      [updatedDisplayName, updatedDescription, updatedPermissions, roleId]
    );

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'ROLE_UPDATED',
      entityType: 'role',
      entityId: roleId,
      details: { role_name: role.name, display_name: updatedDisplayName },
      ipAddress: req.ip,
    });

    res.json({ role: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete custom role (Admin only, cannot delete admin or salesperson)
rolesRouter.delete('/:id', requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.id as string, 10);
    const roleRows = await query('SELECT * FROM roles WHERE id = $1', [roleId]);
    if (roleRows.length === 0) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    const role = roleRows[0];

    if (role.name === 'admin') {
      res.status(400).json({ error: 'The primary Administrator role cannot be deleted' });
      return;
    }

    // Check if any users are currently assigned to this role
    const usersWithRole = await query('SELECT count(*)::int as count FROM users WHERE role = $1', [role.name]);
    if (usersWithRole[0].count > 0) {
      res.status(400).json({
        error: `Cannot delete role '${role.display_name}' because ${usersWithRole[0].count} user(s) are currently assigned to it. Reassign those users first.`,
      });
      return;
    }

    await query('DELETE FROM roles WHERE id = $1', [roleId]);

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'ROLE_DELETED',
      entityType: 'role',
      entityId: roleId,
      details: { role_name: role.name },
      ipAddress: req.ip,
    });

    res.json({ message: `Role '${role.display_name}' deleted successfully` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
