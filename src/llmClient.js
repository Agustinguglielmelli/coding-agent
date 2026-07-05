import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const provider = process.env.LLM_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "gemini");

export const MODEL =
  provider === "openai"
    ? process.env.OPENAI_MODEL || "gpt-4.1-mini"
    : process.env.GEMINI_MODEL || "models/gemini-2.5-flash";

export const RESPONSE_MAX_TOKENS = 16000;

const rawClient =
  provider === "openai"
    ? new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
    : new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      });

export const client = observeOpenAI(rawClient);
