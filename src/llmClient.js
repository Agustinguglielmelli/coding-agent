import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const provider = process.env.LLM_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "gemini");

export const MODEL =
  provider === "openai"
    ? process.env.OPENAI_MODEL || "gpt-4.1-mini"
    : process.env.GEMINI_MODEL || "models/gemini-2.5-flash";

export const client =
  provider === "openai"
    ? new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
    : new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      });
