import { ChatGoogleGenerativeAI } from "@langchain/google-genai";


if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === "") {
  throw new Error("OPENAI_API_KEY is not set");
}

export const geminiClient = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  model: "gemini-2.5-pro",
  temperature: 0.2,
});
