import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from './utils/logger';

let wss: WebSocketServer | null = null;
const connectedClients = new Set<WebSocket>();

export interface WsEvent {
  type:
    | 'QUOTATION_CREATED'
    | 'QUOTATION_UPDATED'
    | 'QUOTATION_STATUS_CHANGED'
    | 'PAYMENT_RECORDED'
    | 'PAYMENT_UPDATED'
    | 'CUSTOMER_UPDATED'
    | 'TARGET_UPDATED'
    | 'SETTINGS_UPDATED'
    | 'DISPATCH_UPDATED'
    | 'DISPATCH_ITEM_CHANGED'
    | 'DISPATCH_CHANGES_ACKNOWLEDGED'
    | 'DASHBOARD_REFRESH'
    | 'LOCAL_PURCHASE_PAYMENT_VERIFIED'
    | 'LOCAL_PURCHASE_AVAILABILITY_VERIFIED'
    | 'dispatch:invoice_verified'
    | 'dispatch:item_reconciled'
    | 'dispatch:partial_applied'
    | 'dispatch:invoice_removed'
    | 'dispatch:updated'
    | 'dispatch:pending_status_updated'
    | 'dispatch:shipment_created'
    | 'dispatch:credit_note_applied'
    | 'godown:arrival_verified'
    | 'godown:loading_verified'
    | 'vendor:inquiry_sent'
    | 'vendor:pi_submitted'
    | 'vendor:payment_proof_recorded'
    | 'vendor:tax_invoice_submitted'
    | 'vendor:stock_updated'
    | 'item_status:changed'
    | 'payment:recorded'
    | 'target:updated'
    | 'sale:closed';
  payload?: any;
  timestamp: string;
}

export function initWebSocketServer(server: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    const clientIp = req.socket.remoteAddress;
    connectedClients.add(ws);
    logger.info(`WebSocket client connected from ${clientIp}. Total active clients: ${connectedClients.size}`);

    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
        }
      } catch (e) {
        // ignore non-json
      }
    });

    ws.on('close', () => {
      connectedClients.delete(ws);
      logger.info(`WebSocket client disconnected. Total active clients: ${connectedClients.size}`);
    });

    ws.on('error', (err) => {
      logger.warn(`WebSocket client error: ${err.message}`);
      connectedClients.delete(ws);
    });

    // Send initial welcome message with server timestamp
    ws.send(
      JSON.stringify({
        type: 'CONNECTED',
        message: 'Connected to AMA Ceramics LAN Central Server',
        timestamp: new Date().toISOString(),
      })
    );
  });

  // Heartbeat ping interval to detect stale socket connections every 30 seconds
  const interval = setInterval(() => {
    if (!wss) return;
    for (const ws of connectedClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}

export function broadcast(event: Omit<WsEvent, 'timestamp'>): void {
  if (!wss || connectedClients.size === 0) return;

  const eventWithTime: WsEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  const payloadStr = JSON.stringify(eventWithTime);
  for (const client of connectedClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payloadStr);
      } catch (err) {
        logger.warn('Failed to send WS message to client', err);
      }
    }
  }
}

export function getConnectedClientCount(): number {
  return connectedClients.size;
}
