
const assert = require("node:assert/strict");
const { after, beforeEach, test } = require("node:test");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/db");

let auction;

beforeEach(async () => {
  await prisma.bidRequest.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.auction.deleteMany();

  auction = await prisma.auction.create({
    data: {
      status: "OPEN",
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60 * 60_000),
      currentTopBidAmount: "0.00",
    },
  });
});

after(async () => {
  await prisma.$disconnect();
});

function submitBid(amount, key, userId = `user-${key}`) {
  return request(app)
    .post("/bid")
    .set("Idempotency-Key", key)
    .send({
      auction_id: auction.id,
      user_id: userId,
      amount: String(amount),
    });
}

test("accepts a valid bid", async () => {
  const response = await submitBid("100.00", "valid-1");

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.bid.amount, "100.00");

  const updated = await prisma.auction.findUnique({
    where: { id: auction.id },
  });

  assert.equal(updated.currentTopBidAmount.toFixed(2), "100.00");
});

test("rejects an equal bid", async () => {
  await submitBid("100.00", "equal-1");
  const response = await submitBid("100.00", "equal-2");

  assert.equal(response.status, 409);
  assert.equal(response.body.code, "BID_NOT_HIGHER_THAN_CURRENT");
});

test("rejects a lower bid", async () => {
  await submitBid("200.00", "lower-1");
  const response = await submitBid("150.00", "lower-2");

  assert.equal(response.status, 409);
  assert.equal(response.body.code, "BID_NOT_HIGHER_THAN_CURRENT");
});

test("replays a duplicate request without creating another bid", async () => {
  const first = await submitBid("100.00", "duplicate-1");
  const second = await submitBid("100.00", "duplicate-1");

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.deepEqual(second.body, first.body);

  const count = await prisma.bid.count({
    where: { auctionId: auction.id },
  });

  assert.equal(count, 1);
});

test("rejects an idempotency key reused with a different payload", async () => {
  await submitBid("100.00", "reuse-1");
  const response = await submitBid("200.00", "reuse-1");

  assert.equal(response.status, 409);
  assert.equal(response.body.code, "IDEMPOTENCY_KEY_REUSED");
});

test("preserves the highest bid under concurrent requests", async () => {
  const amounts = Array.from({ length: 10 }, (_, index) => 301 + index);

  await Promise.all(
    amounts.map((amount) => submitBid(amount, `parallel-${amount}`))
  );

  const updated = await prisma.auction.findUnique({
    where: { id: auction.id },
  });

  assert.equal(updated.currentTopBidAmount.toFixed(2), "310.00");
  assert.equal(updated.currentTopBidderId, "user-parallel-310");

  const winningBid = await prisma.bid.findUnique({
    where: { id: updated.currentTopBidId },
  });

  assert.ok(winningBid);
  assert.equal(winningBid.amount.toFixed(2), "310.00");
  assert.equal(winningBid.userId, "user-parallel-310");
});

test("rejects bids after the auction closes", async () => {
  await prisma.auction.update({
    where: { id: auction.id },
    data: { endsAt: new Date(Date.now() - 1000) },
  });

  const response = await submitBid("100.00", "closed-1");

  assert.equal(response.status, 409);
  assert.equal(response.body.code, "AUCTION_CLOSED");
});
