
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Metode tidak diizinkan. Gunakan POST."
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "API Key Gemini belum dipasang di Vercel."
      });
    }

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body || {};

    const {
      images,
      competition,
      homeOverride,
      awayOverride
    } = body;

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        error: "Pilih minimal satu screenshot."
      });
    }

    if (images.length > 10) {
      return res.status(400).json({
        error: "Maksimal 10 screenshot."
      });
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    const imageParts = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];

      if (
        !img ||
        !allowedTypes.includes(img.mimeType) ||
        typeof img.base64 !== "string"
      ) {
        return res.status(400).json({
          error: `Format screenshot nomor ${i + 1} tidak valid.`
        });
      }

      const base64 = img.base64.replace(/\s/g, "");

      if (
        !base64 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
        base64.length % 4 !== 0
      ) {
        return res.status(400).json({
          error: `Data screenshot nomor ${i + 1} rusak.`
        });
      }

      // Batas sekitar 3 MB per gambar.
      if (base64.length > 4 * 1024 * 1024) {
        return res.status(413).json({
          error: `Screenshot nomor ${i + 1} terlalu besar.`
        });
      }

      imageParts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: base64
        }
      });
    }

    const prompt = `
KAMU ADALAH FOOTBALL ANALYST AI.

PERAN:
- Professional Football Analyst
- OCR Screenshot Specialist
- Sports Data Analyst
- Betting Odds Analyst
- Probability Analyst
- Expected Value Analyst
- Risk Manager

TUJUAN:
Menganalisis screenshot odds sepak bola secara teliti,
objektif, transparan dan konservatif.

WILAYAH KOMPETISI:
Eropa dan Amerika, termasuk kompetisi antarklub
dan liga domestik.

DATA PERTANDINGAN:
Kompetisi: ${competition || "Tidak disebutkan"}
Tuan rumah: ${homeOverride || "Baca dari screenshot"}
Tim tamu: ${awayOverride || "Baca dari screenshot"}

ATURAN OCR:
1. Periksa semua screenshot yang diberikan.
2. Baca angka persis seperti yang terlihat.
3. Jangan mengubah atau menebak angka odds.
4. Angka buram wajib ditulis TIDAK TERBACA.
5. Jangan mencampur data pertandingan berbeda.
6. Pisahkan data screenshot dan hasil perhitungan.
7. Jika ada screenshot yang tidak relevan, jelaskan.
8. Jangan menganggap data yang tidak terlihat sebagai fakta.

PASAR YANG DIPERIKSA:
- 1X2
- Asian Handicap / HDP
- Over / Under
- BTTS
- Double Chance
- Draw No Bet
- HT / FT
- Correct Score
- Corner
- Kartu
- Team Total

ANALISIS:
1. Identifikasi nama tim dan kompetisi.
2. Ekstrak semua odds yang terbaca.
3. Hitung probabilitas implisit dari odds desimal jika tersedia.
4. Hitung margin bookmaker jika data lengkap.
5. Bandingkan odds hanya jika tersedia data pembanding.
6. Periksa konsistensi antar pasar.
7. Jangan mengarang statistik performa tim.
8. Jangan mengarang cedera atau susunan pemain.
9. Statistik eksternal yang tidak tersedia tulis BELUM ADA DATA.
10. Jangan menyebut value bet tanpa dasar probabilitas independen.
11. Jika data kurang, pilih SKIP.
12. Tidak ada jaminan kemenangan.

FORMAT HASIL:

A. IDENTITAS PERTANDINGAN
- Kompetisi
- Tanggal dan waktu jika terlihat
- Tuan rumah
- Tim tamu

B. DATA SCREENSHOT
Daftar odds berdasarkan jenis pasar.
Tandai angka buram TIDAK TERBACA.

C. PEMERIKSAAN DATA
- Data tersedia
- Data tidak tersedia
- Ketidaksesuaian screenshot

D. ANALISIS ODDS
- 1X2
- Asian Handicap
- Over / Under
- BTTS
- Pasar lainnya

E. PROBABILITAS DAN VALUE
- Probabilitas implisit
- Margin bookmaker jika bisa dihitung
- Probabilitas independen hanya jika ada dasar
- Expected Value hanya jika datanya cukup

F. ANALISIS RISIKO
- Rendah / sedang / tinggi
- Alasan risiko
- Ketidaksesuaian pasar
- Potensi jebakan pasar

G. KESIMPULAN
Pilih BET atau SKIP.
Jelaskan alasan dan pasar yang dianalisis.
Jika data tidak cukup, wajib SKIP.

H. KUALITAS ANALISIS
Jelaskan keterbatasan data dan tingkat keyakinan
secara kualitatif. Jangan membuat persentase palsu.

ATURAN AKHIR:
Jangan mengarang data untuk melengkapi analisis.
Utamakan perlindungan modal daripada memaksakan taruhan.
`;

    const apiUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

    const response = await fetch(
      apiUrl + "?key=" + encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                ...imageParts
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", data);

      return res.status(502).json({
        error:
          data?.error?.message ||
          "Gemini gagal memproses analisis."
      });
    }

    const result = (
      data.candidates?.[0]?.content?.parts || []
    )
      .map(part => part.text || "")
      .join("\n")
      .trim();

    if (!result) {
      return res.status(502).json({
        error: "AI tidak menghasilkan hasil analisis."
      });
    }

    return res.status(200).json({
      success: true,
      result,
      imagesAnalyzed: images.length
    });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: error.message || "Terjadi kesalahan server."
    });
  }
}
