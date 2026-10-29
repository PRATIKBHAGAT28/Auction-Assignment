const express = require("express");
const bidRoutes = require("./routes/bid.routes");
const errorHandler = require("./middleware/error.middleware");

const app = express();

app.use(express.json({ limit: "10kb" }));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use(bidRoutes);
app.use(errorHandler);

module.exports = app;