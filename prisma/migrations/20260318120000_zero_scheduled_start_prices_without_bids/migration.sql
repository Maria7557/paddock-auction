UPDATE auctions
SET starting_price = 0,
    current_price = 0,
    updated_at = NOW()
WHERE state = 'SCHEDULED'
  AND NOT EXISTS (
    SELECT 1
    FROM bids
    WHERE bids.auction_id = auctions.id
  );
