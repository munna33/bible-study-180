const express = require("express");
const router = express.Router();
const credentials = require("../config.js");
const fs = require("fs");
const multer = require("multer");
const cors = require("cors");
const bodyParser = require("body-parser");
const { result } = require("lodash");
const { google } = require("googleapis");
const admin = require("firebase-admin");
router.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

router.use(
  cors({
    origin: "*",
  })
);

module.exports = router;