const express = require("express");
const { createBid } = require("../controllers/bid.controller");

const router = express.Router();

router.post("/bid", createBid);

module.exports = router;