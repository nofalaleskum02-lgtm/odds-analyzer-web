
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Gunakan metode POST."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY belum dipasang di Vercel."
    });
  }

  try {
    const { images, competition, homeOverride, awayOverride } =
      req.body || {};

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        error: "Silakan pilih screenshot pertandingan."
      });
    }

    if (images.length > 10) {
      return res.status(400).json({
        error: "Maksimal 10 screenshot dalam satu analisis."
      });
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    const imageParts = images.map((img, index) => {
      if (
        !img ||
        !allowedTypes.includes(img.mimeType) ||
        typeof img.base64 !== "string"
      ) {
        throw new Error(
          `Format screenshot nomor ${index + 1} tidak valid.`
        );
      }

      const base64 = img.base64.replace(
        /^data:image\/[^;]+;base64,/,
        ""
      );

      if (
        !base64 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
      ) {
        throw new Error(
          `Data gambar nomor ${index + 1} tidak valid.`
        );
      }

      return {
        inlineData: {
          mimeType: img.mimeType,
          data: base64
        }
      };
    });

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

KOMPETISI:
${competition || "Tidak diketahui"}

TIM KANDIDAT:
Tuan rumah: ${homeOverride || "Baca dari screenshot"}
Tamu: ${awayOverride || "Baca dari screenshot"}

ATURAN WAJIB OCR:
1. Periksa seluruh gambar yang dikirim.
2. Baca angka persis seperti yang terlihat.
3. Jangan mengubah angka odds.
4. Jangan menebak angka yang buram.
5. Jika tidak terbaca, tulis TIDAK TERBACA.
6. Bedakan odds pembukaan dan odds terbaru jika tersedia.
7. Jangan mencampur data dari pertandingan berbeda.
8. Jika ada gambar yang tidak relevan, jelaskan.

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
1. Identifikasi pertandingan dan kompetisi.
2. Ekstrak seluruh data odds yang terbaca.
3. Hitung probabilitas implisit dari odds desimal jika datanya lengkap.
4. Jelaskan margin bookmaker jika memungkinkan.
5. Analisis pergerakan odds hanya jika tersedia data pembanding.
6. Nilai konsistensi antar pasar.
7. Identifikasi risiko dan kemungkinan jebakan pasar.
8. Jangan menyatakan value bet tanpa dasar probabilitas yang memadai.
9. Jangan mengarang statistik, cedera, susunan pemain atau performa tim.
10. Data statistik eksternal yang tidak tersedia harus ditulis:
    BELUM ADA DATA.
11. Jika data tidak cukup, pilih SKIP.
12. Jangan menjanjikan kemenangan atau akurasi tertentu.

FORMAT JAWABAN:

A. IDENTITAS PERTANDINGAN
- Kompetisi
- Tanggal dan waktu
- Tuan rumah
- Tim tamu

B. HASIL PEMBACAAN SCREENSHOT
Buat daftar seluruh odds yang terbaca.
Pisahkan berdasarkan jenis pasar.
Tandai data buram sebagai TIDAK TERBACA.

C. PEMERIKSAAN DATA
- Data yang tersedia
- Data yang tidak tersedia
- Kesalahan atau ketidaksesuaian gambar

D. ANALISIS ODDS
- 1X2
- Asian Handicap
- Over / Under
- BTTS
- Pasar lainnya jika tersedia

E. PROBABILITAS DAN VALUE
- Probabilitas implisit
- Margin bookmaker jika bisa dihitung
- Estimasi probabilitas independen hanya jika ada dasar data
- Expected Value jika probabilitas independen tersedia

F. ANALISIS RISIKO
- Risiko rendah / sedang / tinggi
- Alasan
- Indikasi pasar yang tidak konsisten
- Potensi jebakan bandar

G. KESIMPULAN
Pilih salah satu:
BET
SKIP

Sertakan alasan yang jelas.
Jika data tidak cukup atau tidak meyakinkan, wajib SKIP.

H. TINGKAT KEYAKINAN
Jelaskan kualitas data dan keterbatasan analisis.
Jangan memberikan persentase keyakinan palsu.

PENTING:
Jangan pernah mengarang data untuk melengkapi analisis.
Utamakan keselamatan modal daripada memaksakan pilihan taruhan.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(apiKey),
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
      console.error("Gemini API error:", data);

      return res.status(502).json({
        error:
          data?.error?.message ||
          "AI gagal memproses screenshot."
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
        error: "AI tidak menghasilkan jawaban."
      });
    }

    return res.status(200).json({
      success: true,
      result,
      imagesAnalyzed: images.length
    });

  } catch (error) {
    console.error("Analysis error:", error);

    return res.status(500).json({
      error: error.message || "Terjadi kesalahan server."
    });
  }
}
