const { placeBid } = require("../services/bid.service");

async function createBid(req, res, next) {
  try {
    const { auction_id, user_id, amount } = req.body;
    const idempotencyKey = req.get("Idempotency-Key");

    if (
      typeof auction_id !== "string" ||
      !auction_id.trim() ||
      typeof user_id !== "string" ||
      !user_id.trim()
    ) {
      return res.status(400).json({
        success: false,
        code: "INVALID_REQUEST",
        message: "auction_id and user_id must be non-empty strings.",
      });
    }

    // Accept decimal strings to avoid floating-point ambiguity.
    if (
      typeof amount !== "string" ||
      !/^\d{1,10}(\.\d{1,2})?$/.test(amount) ||
      !/[1-9]/.test(amount)
    ) {
      return res.status(400).json({
        success: false,
        code: "INVALID_AMOUNT",
        message: "amount must be a positive decimal string with at most 2 decimal places.",
      });
    }

    if (
      typeof idempotencyKey !== "string" ||
      !idempotencyKey.trim() ||
      idempotencyKey.length > 200
    ) {
      return res.status(400).json({
        success: false,
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: "Provide an Idempotency-Key header of up to 200 characters.",
      });
    }

    const result = await placeBid({
      auctionId: auction_id.trim(),
      userId: user_id.trim(),
      amount,
      idempotencyKey,
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
}

module.exports = { createBid };