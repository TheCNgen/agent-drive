#!/bin/bash

# Extract the value of the Next.js auth cookie from playwright state
COOKIE=$(jq -r '.cookies[] | select(.name=="next-auth.session-token") | .value' tests/.auth/buyer.json)

if [ -z "$COOKIE" ]; then
    echo "No cookie found"
    exit 1
fi

echo "Using cookie: $COOKIE"

# Get a listing ID by hitting the listings endpoint
echo "Fetching listings..."
LISTINGS=$(curl -s http://localhost:3000/api/listings)
LISTING_ID=$(echo "$LISTINGS" | jq -r '.listings[0]._id')

if [ -z "$LISTING_ID" ] || [ "$LISTING_ID" == "null" ]; then
    echo "No listings found to purchase."
    exit 1
fi

echo "Found listing ID: $LISTING_ID"

# Make the purchase request using curl
echo "Making purchase request..."
curl -X POST "http://localhost:3000/api/listings/${LISTING_ID}/purchase" \
  -H "Cookie: next-auth.session-token=${COOKIE}" \
  -H "Content-Type: application/json" \
  -d '{"transactionId": "0.0.123456@1234567890.000000000", "networkNodeId": "0.0.3"}' \
  -s | jq .
