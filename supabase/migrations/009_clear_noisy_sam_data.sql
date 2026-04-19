-- Clear old noisy SAM.gov data (generic surplus/disposal/liquidation results).
-- The cron job now only stores LQDT-specific opportunities so fresh data will
-- be relevant. This is a one-time cleanup.
truncate table sam_opportunities;
