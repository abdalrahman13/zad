import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import pdf from "pdf-parse-fork";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// هنخزن الكتب كـ مصفوفة فقرات مش كتلة واحدة عملاقة
let ALL_BOOKS_PARAGRAPHS = [];

async function loadAllPDFs() {
  const booksFolder = "./books";
  try {
    if (!fs.existsSync(booksFolder)) {
      console.log("❌ خطأ: فولدر books مش موجود!");
      return;
    }
    const files = fs
      .readdirSync(booksFolder)
      .filter((file) => file.endsWith(".pdf"));
    console.log(
      `📚 جاري تجهيز وفهرسة ${files.length} كتاب PDF... ثواني من فضلك.`,
    );

    for (const file of files) {
      const dataBuffer = fs.readFileSync(path.join(booksFolder, file));
      const pdfData = await pdf(dataBuffer);

      // بنقسم كتاب الطالب لفقرات بناءً على السطور والمواضيع
      const paragraphs = pdfData.text
        .split("\n\n")
        .filter((p) => p.trim().length > 30);

      paragraphs.forEach((p) => {
        ALL_BOOKS_PARAGRAPHS.push({
          book: file,
          text: p.trim(),
        });
      });
    }
    console.log(
      `✅ تم فهرسة ${ALL_BOOKS_PARAGRAPHS.length} فقرة تعليمية بنجاح! السيرفر مستعد.`,
    );
  } catch (error) {
    console.error("❌ حصلت مشكلة أثناء قراءة ملفات الـ PDF:", error);
  }
}

// دالة سحرية بتبحث في الـ 33 كتاب وتجيب الفقرات القريبة جداً من سؤال الطالب
function getRelevantContext(userQuery, maxParagraphs = 5) {
  const keywords = userQuery
    .toLowerCase()
    .split(" ")
    .filter((w) => w.length > 2);
  if (keywords.length === 0) return "";

  // ترتيب الفقرات حسب عدد الكلمات المشتركة مع سؤال الطالب
  const scored = ALL_BOOKS_PARAGRAPHS.map((p) => {
    let score = 0;
    keywords.forEach((kw) => {
      if (p.text.toLowerCase().includes(kw)) score++;
    });
    return { ...p, score };
  })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);

  // بناخد أفضل 5 فقرات بيتكلموا عن الموضوع بالظبط
  const topParagraphs = scored.slice(0, maxParagraphs);

  if (topParagraphs.length === 0)
    return "ملاحظة: لم يتم العثور على نصوص متطابقة مباشرة في الكتب، أجب بناءً على معرفتك الأزهرية العامة الموثوقة.";

  return topParagraphs
    .map((p) => `[مصدر من كتاب: ${p.book}]\n${p.text}`)
    .join("\n\n");
}

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "المحتوى فارغ" });

  try {
    // الفلترة الذكية بتحصل هنا في ثانية واحدة
    const relevantContext = getRelevantContext(message);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Instructions: أنت مساعد ذكي لمنصة زاد المعرفة التعليمية الأزهرية. وظيفتك الإجابة على أسئلة الطلاب في المواد الشرعية والعربية بأسلوب وقور، فصيح، ومبسط يناسب طلاب العلم الأزهريين ومستخرج بدقة من الفقرات المرفقة المأخوذة من كتب المنهج. إذا لم تجد الإجابة في الفقرات المتاحة، استخدم علمك الشرعي العام للإجابة بدقة وبمنهج أزهري رصين.\n\n📚 الفقرات المستخرجة من كتب المنهج ذات الصلة بسؤال الطالب:\n${relevantContext}\n\nسؤال الطالب الحالي: ${message}`,
            },
          ],
        },
      ],
    });

    res.json({ reply: response.text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: "واجهت مشكلة في معالجة الرد." });
  }
});

const PORT = 3000;
app.listen(PORT, async () => {
  console.log(`🚀 السيرفر شغال دلوقتي على رابط: http://localhost:${PORT}`);
  await loadAllPDFs();
});
