const { createHash } = require("node:crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../db");

function makeResult(status, body) {
  return { status, body };
}

function hashPayload({ auctionId, userId, amount }) {
  return createHash("sha256")
    .update(JSON.stringify({ auctionId, userId, amount }))
    .digest("hex");
}

async function placeBid({
  auctionId,
  userId,
  amount,
  idempotencyKey,
}) {
  const payloadHash = hashPayload({ auctionId, userId, amount });

  return prisma.$transaction(async (tx) => {
    // Serialize requests that use the same idempotency key.
    await tx.$queryRaw`
      WITH lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(
          hashtextextended(${idempotencyKey}, 0)
        )
      )
      SELECT 1 AS locked
      FROM lock
    `;

    const previousRequest = await tx.bidRequest.findUnique({
      where: { idempotencyKey },
    });

    if (previousRequest) {
      if (previousRequest.payloadHash !== payloadHash) {
        return makeResult(409, {
          success: false,
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "This key was already used for a different request.",
        });
      }

      return makeResult(
        previousRequest.responseStatus,
        previousRequest.responseBody
      );
    }

    // Lock the auction row before checking or changing its state.
    await tx.$queryRaw`
      SELECT "id"
      FROM "Auction"
      WHERE "id" = ${auctionId}
      FOR UPDATE
    `;

    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
    });

    let result;

    if (!auction) {
      result = makeResult(404, {
        success: false,
        code: "AUCTION_NOT_FOUND",
        message: "Auction not found.",
      });
    } else {
      // Use the database clock for the closing-time decision.
      const [{ now }] = await tx.$queryRaw`
        SELECT clock_timestamp() AS "now"
      `;

      if (auction.status !== "OPEN") {
        result = makeResult(409, {
          success: false,
          code: "AUCTION_NOT_OPEN",
          message: "Auction is not open.",
        });
      } else if (now < auction.startsAt) {
        result = makeResult(409, {
          success: false,
          code: "AUCTION_NOT_STARTED",
          message: "Auction has not started.",
        });
      } else if (now >= auction.endsAt) {
        result = makeResult(409, {
          success: false,
          code: "AUCTION_CLOSED",
          message: "Auction has closed.",
        });
      } else {
        const bidAmount = new Prisma.Decimal(amount);

        if (bidAmount.lessThanOrEqualTo(auction.currentTopBidAmount)) {
          result = makeResult(409, {
            success: false,
            code: "BID_NOT_HIGHER_THAN_CURRENT",
            message: "Your bid must exceed the current top bid.",
            currentTopBidAmount:
              auction.currentTopBidAmount.toFixed(2),
          });
        } else {
          const bid = await tx.bid.create({
            data: {
              auctionId,
              userId,
              amount: bidAmount,
            },
          });

          await tx.auction.update({
            where: { id: auctionId },
            data: {
              currentTopBidAmount: bidAmount,
              currentTopBidderId: userId,
              currentTopBidId: bid.id,
            },
          });

          result = makeResult(201, {
            success: true,
            bid: {
              id: bid.id,
              auctionId,
              userId,
              amount: bidAmount.toFixed(2),
            },
            auction: {
              currentTopBidAmount: bidAmount.toFixed(2),
              currentTopBidderId: userId,
              currentTopBidId: bid.id,
            },
          });
        }
      }
    }

    // Store accepted and rejected outcomes for consistent retries.
    await tx.bidRequest.create({
      data: {
        idempotencyKey,
        payloadHash,
        auctionId,
        userId,
        responseStatus: result.status,
        responseBody: result.body,
      },
    });

    return result;
  });
}

module.exports = { placeBid };