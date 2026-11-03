import { Router, Request, Response } from 'express';
import { query } from '../db/connection';
import { authenticateToken } from '../middleware/auth';

export const dashboardRouter = Router();

dashboardRouter.use(authenticateToken);

dashboardRouter.get('/summary', async (req: Request, res: Response) => {
  try {
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';
    const filterUser = isSalesperson
      ? `WHERE (q.sales_person_id = ${req.user!.id} OR q.assisted_sales_person_id = ${req.user!.id})`
      : '';

    // Status breakdown (split-aware when salesperson)
    const statusCounts = await query(`
      SELECT LOWER(q.status) as status, count(*) as count,
        COALESCE(SUM(
          CASE
            WHEN ${isSalesperson ? 'true' : 'false'} THEN
              CASE
                WHEN q.sales_person_id = ${req.user!.id} THEN
                  CASE
                    WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
                    WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
                    ELSE q.net_total
                  END
                WHEN q.assisted_sales_person_id = ${req.user!.id} THEN
                  CASE
                    WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
                    WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
                    ELSE 0
                  END
                ELSE q.net_total
              END
            ELSE q.net_total
          END
        ), 0) as total_val
      FROM quotations q
      ${filterUser}
      GROUP BY LOWER(q.status)
    `);

    // Financial totals (split-aware)
    const financialTotals = await query(`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN ${isSalesperson ? 'true' : 'false'} THEN
              CASE
                WHEN q.sales_person_id = ${req.user!.id} THEN
                  CASE
                    WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
                    WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
                    ELSE q.net_total
                  END
                WHEN q.assisted_sales_person_id = ${req.user!.id} THEN
                  CASE
                    WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
                    WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
                    ELSE 0
                  END
                ELSE q.net_total
              END
            ELSE q.net_total
          END
        ), 0) as total_quoted,
        COALESCE(SUM(
          CASE
            WHEN LOWER(q.status) IN ('approved', 'closed') THEN
              CASE
                WHEN ${isSalesperson ? 'true' : 'false'} THEN
                  CASE
                    WHEN q.sales_person_id = ${req.user!.id} THEN
                      CASE
                        WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
                        WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
                        ELSE q.net_total
                      END
                    WHEN q.assisted_sales_person_id = ${req.user!.id} THEN
                      CASE
                        WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
                        WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
                        ELSE 0
                      END
                    ELSE q.net_total
                  END
                ELSE q.net_total
              END
            ELSE 0
          END
        ), 0) as approved_revenue
      FROM quotations q
      ${filterUser}
    `);

    // Payments collected (split-aware)
    const paymentTotals = await query(`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN ${isSalesperson ? 'true' : 'false'} THEN
              CASE
                WHEN q.sales_person_id = ${req.user!.id} THEN
                  CASE
                    WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((p.amount * q.primary_sales_share_percent / 100.0)::numeric, 2)
                    WHEN q.assisted_sales_person_id IS NOT NULL AND q.net_total > 0 THEN ROUND((p.amount * (q.primary_sales_share_amount / q.net_total))::numeric, 2)
                    ELSE p.amount
                  END
                WHEN q.assisted_sales_person_id = ${req.user!.id} THEN
                  CASE
                    WHEN q.assisted_sales_share_percent > 0 THEN ROUND((p.amount * q.assisted_sales_share_percent / 100.0)::numeric, 2)
                    WHEN q.net_total > 0 THEN ROUND((p.amount * (q.assisted_sales_share_amount / q.net_total))::numeric, 2)
                    ELSE 0
                  END
                ELSE p.amount
              END
            ELSE p.amount
          END
        ), 0) as total_collected
      FROM payments p
      JOIN quotations q ON q.id = p.quotation_id
      WHERE p.status = 'Cleared' ${isSalesperson ? `AND (q.sales_person_id = ${req.user!.id} OR q.assisted_sales_person_id = ${req.user!.id})` : ''}
    `);

    // Total outstanding on approved/closed quotations
    const approvedRevenue = parseFloat(financialTotals[0]?.approved_revenue || '0');
    const totalCollected = parseFloat(paymentTotals[0]?.total_collected || '0');
    const totalOutstanding = Math.max(0, approvedRevenue - totalCollected);

    // Recent 10 quotations with Store Manager approval details
    const recentQuotations = await query(`
      SELECT q.id, q.quotation_number, q.quotation_date, q.customer_name, q.sales_person_name,
             q.assisted_sales_person_name, q.status, q.net_total, q.quotation_type,
             q.primary_sales_share_amount, q.assisted_sales_share_amount,
             q.approved_by_id, u_app.full_name as approved_by_name, q.approved_at
      FROM quotations q
      LEFT JOIN users u_app ON u_app.id = q.approved_by_id
      ${filterUser}
      ORDER BY q.created_at DESC
      LIMIT 10
    `);

    // Leaderboard (split-aware for managers/admins/accounts)
    let leaderboard: any[] = [];
    if (!isSalesperson) {
      leaderboard = await query(`
        SELECT u.id, u.full_name,
               count(combined.quotation_id) as total_quotations,
               COALESCE(SUM(combined.credited_amount), 0) as sales_achieved
        FROM users u
        LEFT JOIN (
          -- Primary sales
          SELECT
            q.sales_person_id as user_id,
            q.id as quotation_id,
            CASE
              WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
              WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
              ELSE q.net_total
            END as credited_amount
          FROM quotations q
          WHERE LOWER(q.status) IN ('approved', 'closed')

          UNION ALL

          -- Assisted sales
          SELECT
            q.assisted_sales_person_id as user_id,
            q.id as quotation_id,
            CASE
              WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
              WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
              ELSE 0
            END as credited_amount
          FROM quotations q
          WHERE LOWER(q.status) IN ('approved', 'closed')
            AND q.assisted_sales_person_id IS NOT NULL
        ) combined ON combined.user_id = u.id
        WHERE u.role IN ('salesperson', 'manager') AND u.is_active = true
        GROUP BY u.id, u.full_name
        ORDER BY sales_achieved DESC
        LIMIT 5
      `);
    }

    // Monthly breakdown (last 6 months, split-aware)
    const monthlyTrend = await query(`
      SELECT
        TO_CHAR(q.quotation_date, 'YYYY-MM') as month,
        count(*) as quotation_count,
        COALESCE(SUM(
          CASE
            WHEN LOWER(q.status) IN ('approved', 'closed') THEN
              CASE
                WHEN ${isSalesperson ? 'true' : 'false'} THEN
                  CASE
                    WHEN q.sales_person_id = ${req.user!.id} THEN
                      CASE
                        WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
                        WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
                        ELSE q.net_total
                      END
                    WHEN q.assisted_sales_person_id = ${req.user!.id} THEN
                      CASE
                        WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
                        WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
                        ELSE 0
                      END
                    ELSE q.net_total
                  END
                ELSE q.net_total
              END
            ELSE 0
          END
        ), 0) as closed_amount
      FROM quotations q
      ${filterUser ? `${filterUser} AND` : 'WHERE'} q.quotation_date >= NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(q.quotation_date, 'YYYY-MM')
      ORDER BY month ASC
    `);

    const dispatchUserFilter = isSalesperson
      ? `AND (q.sales_person_id = ${req.user!.id} OR q.assisted_sales_person_id = ${req.user!.id})`
      : '';

    const todaysDispatches = await query(`
      SELECT 
        q.id,
        q.quotation_number,
        q.customer_name,
        q.customer_phone,
        q.site_location,
        q.sales_person_name,
        COALESCE(q.dispatch_status, 'Ready Stock') as dispatch_status,
        q.expected_dispatch_date,
        COUNT(qi.id) as total_items,
        COUNT(CASE WHEN qi.dispatch_status = 'Dispatched' THEN 1 END) as dispatched_items_count
      FROM quotations q
      LEFT JOIN quotation_items qi ON qi.quotation_id = q.id
      WHERE LOWER(q.status) = 'closed'
        AND q.expected_dispatch_date = CURRENT_DATE
        AND COALESCE(q.dispatch_status, 'Ready Stock') != 'Dispatched'
        ${dispatchUserFilter}
      GROUP BY q.id
      ORDER BY q.id DESC
    `);

    let personalAchievement: any = null;
    if (isSalesperson) {
      const userTargetRes = await query('SELECT monthly_target FROM users WHERE id = $1', [req.user!.id]);
      const monthlyTarget = parseFloat(userTargetRes[0]?.monthly_target || '0');
      const approvedCountRes = await query(
        `SELECT count(*) as count FROM quotations WHERE LOWER(status) IN ('approved', 'closed') AND (sales_person_id = $1 OR assisted_sales_person_id = $1)`,
        [req.user!.id]
      );
      const approvedOrdersCount = parseInt(approvedCountRes[0]?.count || '0', 10);
      personalAchievement = {
        monthlyTarget,
        approvedRevenue,
        approvedOrdersCount,
        percentage: monthlyTarget > 0 ? parseFloat(((approvedRevenue / monthlyTarget) * 100).toFixed(1)) : 0,
        difference: parseFloat((approvedRevenue - monthlyTarget).toFixed(2)),
      };
    }

    res.json({
      statusCounts,
      financials: {
        totalQuoted: parseFloat(financialTotals[0]?.total_quoted || '0'),
        approvedRevenue,
        totalCollected,
        totalOutstanding,
      },
      recentQuotations,
      leaderboard,
      personalAchievement,
      monthlyTrend,
      todaysDispatches,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
