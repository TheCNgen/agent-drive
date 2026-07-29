#!/bin/bash

SELLER_COOKIE=$(jq -r '.cookies[] | select(.name=="next-auth.session-token") | .value' tests/.auth/seller.json)
BUYER_COOKIE=$(jq -r '.cookies[] | select(.name=="next-auth.session-token") | .value' tests/.auth/buyer.json)

echo "1. Creating an item as seller..."
ITEM_RES=$(curl -s -X POST "http://localhost:3000/api/items" \
  -H "Cookie: next-auth.session-token=${SELLER_COOKIE}" \
  -F "name=test-file-$RANDOM.txt" \
  -F "url=http://example.com/test.txt")

ITEM_ID=$(echo "$ITEM_RES" | jq -r '._id')

echo "Created Item ID: $ITEM_ID"

echo "2. Creating a listing for the item..."
LISTING_RES=$(curl -s -X POST "http://localhost:3000/api/listings" \
  -H "Cookie: next-auth.session-token=${SELLER_COOKIE}" \
  -H "Content-Type: application/json" \
  -d "{\"itemId\":\"${ITEM_ID}\",\"title\":\"Test Listing\",\"description\":\"A test item\",\"priceTinybars\":\"100000000\",\"affiliateEnabled\":true}")
LISTING_ID=$(echo "$LISTING_RES" | jq -r '._id')

echo "Created Listing ID: $LISTING_ID"

echo "3. Buying the listing as buyer..."
PURCHASE_RES=$(curl -s -X POST "http://localhost:3000/api/listings/${LISTING_ID}/purchase" \
  -H "Cookie: next-auth.session-token=${BUYER_COOKIE}" \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"0.0.123456@1234567890.000000000","networkNodeId":"0.0.3"}')

echo "Purchase result:"
echo "$PURCHASE_RES" | jq .
