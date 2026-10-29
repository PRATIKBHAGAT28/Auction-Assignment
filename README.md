# Auction Bidding API

# ASSIGNMENT ID ::: v#hdf38%44

## Prerequisites

- Node.js and npm
- Docker Desktop
- PostgreSQL running through Docker Compose

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure the `.env` file:

   ```env
   DATABASE_URL="postgresql://auction_user:auction_password@localhost:5432/auction_db?schema=public"
   PORT=3001
   ```

3. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

4. Apply database migrations and generate Prisma Client:

   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

5. Start the API:

   ```bash
   npm run dev
   ```

## Database Management

Open Prisma Studio to view and manage database records:

```bash
npx --no-install prisma studio
```

Prisma Studio opens at the URL displayed in your terminal, typically `http://localhost:5555`.

### Create a Test Auction

Create an auction before testing the bidding endpoint.

1. Open Prisma Studio.
2. Select the `Auction` model and click **Add record**.
3. Set the following fields:

   | Field | Value |
   |---|---|
   | `status` | `OPEN` |
   | `startsAt` | A date and time in the past |
   | `endsAt` | A date and time in the future |
   | `currentTopBidAmount` | `0` |
   | `currentTopBidderId` | `NULL` |
   | `currentTopBidId` | `NULL` |

4. Save the record. Leave automatically generated fields at their defaults.
5. Copy the generated `id` from the saved auction.

Use this ID as `auction_id` in the curl examples below. Replace `YOUR_AUCTION_ID` with the ID generated in your database.

## API Endpoints

### Health Check

`GET /health`

```bash
curl http://localhost:3001/health
```

### Place a Bid

`POST /bid`

**Headers**

- `Content-Type: application/json`
- `Idempotency-Key`: A unique key for each new request.

**Request body**

```json
{
  "auction_id": "YOUR_AUCTION_ID",
  "user_id": "user-42",
  "amount": "100.00"
}
```

The auction must exist and be open, and the bid amount must be greater than the current top bid.

## Bid Testing

Replace `YOUR_AUCTION_ID` in every command with the ID of the auction you created.

### 1. Submit a Valid Bid

```bash
curl --location 'http://localhost:3001/bid' \
--header 'Content-Type: application/json' \
--header 'Idempotency-Key: bid-request-001' \
--data '{
  "auction_id": "YOUR_AUCTION_ID",
  "user_id": "user-42",
  "amount": "100.00"
}'
```

Expected: `201 Created`.

### 2. Submit a Higher Bid

```bash
curl --location 'http://localhost:3001/bid' \
--header 'Content-Type: application/json' \
--header 'Idempotency-Key: bid-request-002' \
--data '{
  "auction_id": "YOUR_AUCTION_ID",
  "user_id": "user-99",
  "amount": "200.00"
}'
```

Expected: `201 Created`. The current top bid becomes `200.00`.

### 3. Submit an Equal Bid

```bash
curl --location 'http://localhost:3001/bid' \
--header 'Content-Type: application/json' \
--header 'Idempotency-Key: bid-request-003' \
--data '{
  "auction_id": "YOUR_AUCTION_ID",
  "user_id": "user-77",
  "amount": "200.00"
}'
```

Expected: `409 Conflict`, with code `BID_NOT_HIGHER_THAN_CURRENT`.

### 4. Submit a Lower Bid

```bash
curl --location 'http://localhost:3001/bid' \
--header 'Content-Type: application/json' \
--header 'Idempotency-Key: bid-request-004' \
--data '{
  "auction_id": "YOUR_AUCTION_ID",
  "user_id": "user-55",
  "amount": "150.00"
}'
```

Expected: `409 Conflict`, with code `BID_NOT_HIGHER_THAN_CURRENT`.

### 5. Retry a Duplicate Request

Repeat the original request with the same idempotency key and identical payload.

```bash
curl --location 'http://localhost:3001/bid' \
--header 'Content-Type: application/json' \
--header 'Idempotency-Key: bid-request-001' \
--data '{
  "auction_id": "YOUR_AUCTION_ID",
  "user_id": "user-42",
  "amount": "100.00"
}'
```

Expected: The original response is returned without creating another bid.

### 6. Reuse an Idempotency Key with a Different Payload

Reuse `bid-request-001`, but change the amount.

```bash
curl --location 'http://localhost:3001/bid' \
--header 'Content-Type: application/json' \
--header 'Idempotency-Key: bid-request-001' \
--data '{
  "auction_id": "YOUR_AUCTION_ID",
  "user_id": "user-42",
  "amount": "250.00"
}'
```

Expected: `409 Conflict`, with code `IDEMPOTENCY_KEY_REUSED`.

### 7. Test Concurrent Bids

Submit bids concurrently from `301.00` through `310.00`.

```bash
for amount in {301..310}; do
  curl -s -X POST http://localhost:3001/bid \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: concurrent-$amount" \
    -d "{
      \"auction_id\": \"YOUR_AUCTION_ID\",
      \"user_id\": \"user-$amount\",
      \"amount\": \"$amount.00\"
    }" > "/tmp/bid-$amount.json" &
done
wait
```

Inspect the responses:

```bash
for amount in {301..310}; do
  echo "===== Bid $amount ====="
  cat "/tmp/bid-$amount.json"
  echo
done
```

Expected: The highest submitted amount, `310.00`, becomes the top bid, with `user-310` as the top bidder, assuming all requests are valid and the auction remains open.

### 8. Test a Closed Auction

In Prisma Studio, update the auction's `endsAt` field to a time in the past. Then submit a bid:

```bash
curl --location 'http://localhost:3001/bid' \
--header 'Content-Type: application/json' \
--header 'Idempotency-Key: closed-auction-001' \
--data '{
  "auction_id": "YOUR_AUCTION_ID",
  "user_id": "user-closed",
  "amount": "999.00"
}'
```

Expected: `409 Conflict`, with code `AUCTION_CLOSED`.

Restore the original `endsAt` value if you want to continue using the auction.

## Response Status Codes

| Status | Description |
|---|---|
| `201` | Bid accepted |
| `400` | Invalid request |
| `404` | Auction not found |
| `409` | Bid rejected or idempotency conflict |
| `500` | Internal server error |

## Automated Tests

Run the test suite:

```bash
npm test
```



# REQUIRED ANSWERS 

## 1. Data Model and Why I Used It

I used PostgreSQL with Prisma and created three models: `Auction`, `Bid`, and `BidRequest`.

- `Auction` stores auction details and the current highest bid.
- `Bid` stores all accepted bids.
- `BidRequest` helps handle duplicate requests and return the same response when a request is retried.

I used transactions and row locking to make sure the highest bid stays correct when multiple users bid at the same time.

## 2. How I Handled the Auction Closing Time

I check the closing time using PostgreSQL's `clock_timestamp()`. If the current time is greater than or equal to `endsAt`, the auction is considered closed, and the bid is rejected with a `409 Conflict` response.

## 3. How I Handle a New Bid

First, I validate the request and check if it has already been processed. Then I lock the auction row and check whether the auction is open and the new bid is higher than the current highest bid.

If everything is valid, I save the bid, update the auction's highest bid, and store the response in the same transaction. This helps prevent duplicate bids and issues when multiple requests arrive at the same time.

## 4. If a User Bids on Their Own Highest Bid

I allow it as long as the new bid is higher than their previous bid. For example, if their current bid is `100.00`, they can bid `110.00`, but they cannot bid `100.00` or less.

I chose this because the same rule should apply to everyone: every new bid must be higher than the current highest bid.

## 5. One Thing I Would Improve for Production

If many users bid on the same auction at once, database row locking could make some requests slower.

I would monitor the database performance and lock wait times. If this becomes a problem, I would consider using a queue for each auction so bids can be processed in order while keeping the highest bid correct.
