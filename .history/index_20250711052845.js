const express = require("express");
const path = require("path");
const mysql = require("mysql2");
// const QRCode = require("qrcode");
// const crypto = require("crypto");
const puppeteer = require('puppeteer');

const app = express();

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MySQL Connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "king",
  database: "Traval",
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    return;
  }
  console.log("Connected to the database");
});

// GET All Records
app.get("/api/", (req, res) => {
  db.query("SELECT * FROM PersonRecord", (err, results) => {
    if (err) {
      console.error("Error fetching data:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

const crypto = require("crypto");
const QRCode = require("qrcode");

// POST: Insert and Generate QR for TravalRecord
app.post("/", (req, res) => {
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
    passport_number
  } = req.body;

  const qrToken = crypto.randomBytes(16).toString("hex");
  const qrUrl = `http://localhost:3000/pdf?token=${qrToken}`;

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
      room_name, facility_name, facility_number,
      request_number, request_type, applicant_name,
      creation_date, request_amount, expiry_date,
      record_number, request_status, reference_number,
      passport_number, qrBase64, qrToken
    ];

    db.query(insertQuery, insertValues, (err, result) => {
      if (err) {
        console.error("Insert Failed:", err);
        return res.status(500).json({ error: "Insert failed" });
      }

      res.status(201).json({
        message: "Travel record added with QR code",
        recordId: result.insertId,
        token: qrToken,
        qrcode: qrBase64
      });
    });
  });
});


app.delete("/delete:token", (req, res) => {
  const token = req.params.token;
  db.query("DELETE FROM TravelRecord WHERE qr_token = ?", [token], (err, result) => {
    if (err) {
      console.error("Error deleting record:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Record not found" });
    }
    res.json({ message: "Record deleted successfully" });
  });
});

app.get('/api/download-pdf', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  // Fetch the person from DB
  db.query('SELECT * FROM PersonRecord WHERE qr_token = ?', [token], async (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ error: 'Data not found' });
    }

    const person = results[0];

    try {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      const url = `http://localhost:3000/pdf.html?token=${token}`;
      await page.goto(url, { waitUntil: 'networkidle0' });

      // ✅ Inject QR code manually into DOM before capturing PDF
      await page.evaluate((qrcodeUrl) => {
        const img = document.getElementById("qrcode");
        if (img) {
          img.setAttribute("src", qrcodeUrl);
        }
      }, person.qrcode_url);

      // Wait for the image to render
      await page.waitForSelector('#qrcode[src]', { timeout: 5000 });

     const pdfBuffer = await page.pdf({
     format: 'A4',
       printBackground: true,
     scale: 0.8 // Try 0.8, or 0.7 if still too large
      });


      await browser.close();
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="record_${token}.pdf"`,
      });
      res.send(pdfBuffer);

    } catch (err) {
      console.error("PDF generation error:", err);
      res.status(500).send('Failed to generate PDF');
    }
  });
});

app.get("/form", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "form.html"));
});

app

app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});