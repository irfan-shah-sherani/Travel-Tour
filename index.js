const express = require("express");
const path = require("path");
const mysql = require("mysql2");
const QRCode = require("qrcode");
const crypto = require("crypto");
const puppeteer = require("puppeteer");
const methodOverride = require("method-override");
const bodyParser = require("body-parser");
const session = require("express-session");
require("dotenv").config();

const app = express();

// app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));
// Middleware
app.use(express.static(path.join(__dirname, "assets")));
app.use(express.json());


app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method")); // For PUT/DELETE support in forms
// MySQL Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "king",
  database: process.env.DB_NAME || "Traval",
  port: process.env.DB_PORT || 3306, 
  charset: "utf8mb4"
});

const USERS = { [process.env.ADMIN_USER]: process.env.ADMIN_PASS };


app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,   // Extra safety: prevents JS access to cookie
      secure: false,    // Set to true if using HTTPS (like on Vercel with HTTPS)
      maxAge: 1000 * 60 * 60 // 1 hour in milliseconds
    }
  })
);


db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    return;
  }
  console.log("Connected to the database");
});

// Serve login page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (USERS[username] && USERS[username] === password) {
    req.session.loggedIn = true;
    res.redirect("/Dashboard");
  } else {
    res.send("Invalid login");
  }
});

// GET All Records

app.get("/Dashboard", (req, res) => {
  if (!req.session.loggedIn) {
    return res.send("Access Denied. <a href='/'>Login</a>");
  }
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/api/records", (req, res) => {
  db.query("SELECT * FROM TravalRecord", (err, results) => {
    if (err) {
      console.error("Error fetching data:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(results); // Send all records as JSON
  });
});

// POST: Insert and Generate QR
app.post("/Dashboard", (req, res) => {
  const {
    room_name,
    facility_name,
    facility_number,
    request_number,
    request_type,
    applicant_name,
    creation_date,
    request_amount,
    expiry_date,
    record_number,
    request_status,
    reference_number,
    passport_number,
  } = req.body;

  // Helper to convert empty strings to null
  function toNullIfEmpty(value) {
    return value === '' ? null : value;
  }

  // Sanitize numeric fields: convert invalid numbers to null
  function toNullIfInvalidNumber(value) {
    if (value === '' || isNaN(value)) return null;
    return Number(value);
  }

  // Sanitize date fields (optional: you may want more strict validation)
  function toNullIfInvalidDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : value;
  }
const qrToken = crypto.randomBytes(16).toString("hex");

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const qrUrl = `${baseUrl}/form?token=${qrToken}`;


  QRCode.toDataURL(qrUrl, (err, qrBase64) => {
    if (err) {
      console.error("QR Generation Failed:", err);
      return res.status(500).json({ error: "QR Code generation failed" });
    }

    const insertQuery = `
      INSERT INTO TravalRecord (
        room_name, facility_name, facility_number,
        request_number, request_type, applicant_name,
        creation_date, request_amount, expiry_date,
        record_number, request_status, reference_number,
        passport_number, qrcode_url, qr_token
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertValues = [
      toNullIfEmpty(room_name),
      toNullIfEmpty(facility_name),
      toNullIfEmpty(facility_number),
      toNullIfEmpty(request_number),
      toNullIfEmpty(request_type),
      toNullIfEmpty(applicant_name),
      toNullIfInvalidDate(creation_date),
      toNullIfInvalidNumber(request_amount),
      toNullIfInvalidDate(expiry_date),
      toNullIfEmpty(record_number),
      toNullIfEmpty(request_status),
      toNullIfEmpty(reference_number),
      toNullIfEmpty(passport_number),
      qrBase64,
      qrToken,
    ];

    db.query(insertQuery, insertValues, (err, result) => {
      if (err) {
        console.error("Insert Failed:", err);
        return res.status(500).json({ error: "Insert failed" });
      }

      res.redirect("/Dashboard");
    });
  });
});


// Serve the PDF-style HTML page
app.get("/pdf", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pdf.html"));
});

// // Provide data as JSON to fill in the page
app.get("/pdf-data", (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: "Token is required" });

  db.query(
    "SELECT * FROM TravalRecord WHERE qr_token = ?",
    [token],
    (err, results) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (results.length === 0)
        return res.status(404).json({ error: "Record not found" });

      res.json(results[0]);
    }
  );
});

app.get("/download-pdf", async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: "Token is required" });

  db.query(
    "SELECT * FROM TravalRecord WHERE qr_token = ?",
    [token],
    async (err, results) => {
      if (err || results.length === 0) {
        return res.status(404).json({ error: "Data not found" });
      }

      const person = results[0];

      try {
        const browser = await puppeteer.launch({
          headless: "new",
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        const page = await browser.newPage();

        // ✅ Use the pretty, styled PDF view page
        const url = `http://localhost:3000/pdf?token=${token}`;
        await page.goto(url, { waitUntil: "networkidle0" });

        // Optional: wait for images like logos or QR code to load
        await page.waitForSelector("#qrcode[src]", { timeout: 5000 });

        const pdfBuffer = await page.pdf({
          format: "A4",
          printBackground: true,
          scale: 0.7,
          margin: {
            top: "0mm",
            bottom: "0mm",
            left: "0mm",
            right: "0mm",
          },
        });

        await browser.close();

        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="record_${token}.pdf"`,
        });

        res.send(pdfBuffer);
      } catch (err) {
        console.error("PDF generation error:", err);
        res.status(500).send("Failed to generate PDF");
      }
    }
  );
});

app.get("/form", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "form.html"));
});

app.get("/form-record", (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: "Token is required" });

  db.query(
    "SELECT * FROM TravalRecord WHERE qr_token = ?",
    [token],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Database error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: "Record not found" });
      }
      console.log("Fetched Data:", results[0]);

      res.json(results[0]); 
    }
  );
});

// Delete Record
app.delete("/delete/:token", (req, res) => {
  const token = req.params.token;
  db.query(
    "DELETE FROM TravalRecord WHERE qr_token = ?",
    [token],
    (err, result) => {
      if (err) {
        console.error("Delete Failed:", err);
        return res.status(500).json({ error: "Delete failed" });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Record not found" });
      }
      res.redirect("/"); // or reload to list page after delete
    }
  );
});

app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
