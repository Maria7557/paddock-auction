UPDATE "Vehicle" AS v
SET "market_price" = NULL
WHERE v."market_price" = 700000.00
  AND EXISTS (
    SELECT 1
    FROM auctions AS a
    WHERE a.vehicle_id = v.id
      AND a.state = 'DRAFT'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM audit_logs AS al
    WHERE al.entity_type = 'Vehicle'
      AND al.entity_id = v.id
      AND al.action = 'VEHICLE_MARKET_PRICE_SET'
  );
