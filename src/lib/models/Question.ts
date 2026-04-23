import mongoose, { Schema, Document } from "mongoose";
import crypto from "crypto";

export const TOPICS = [
  "Ethical and Professional Standards",
  "Quantitative Methods",
  "Economics",
  "Financial Statement Analysis",
  "Corporate Issuers",
  "Equity Investments",
  "Fixed Income",
  "Derivatives",
  "Alternative Investments",
  "Portfolio Management",
] as const;

export type Topic = (typeof TOPICS)[number];

// Midpoint weights for proportional question distribution
export const TOPIC_WEIGHTS: Record<Topic, number> = {
  "Ethical and Professional Standards": 0.175,
  "Quantitative Methods": 0.075,
  "Economics": 0.075,
  "Financial Statement Analysis": 0.125,
  "Corporate Issuers": 0.075,
  "Equity Investments": 0.125,
  "Fixed Income": 0.125,
  "Derivatives": 0.065,
  "Alternative Investments": 0.065,
  "Portfolio Management": 0.095,
};

export interface IQuestionImage {
  data: string; // base64-encoded PNG
  contentType: string; // e.g. "image/png"
  location: "question" | "explanation";
}

export interface IQuestion extends Document {
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  correctAnswer: "A" | "B" | "C";
  topic: Topic;
  explanation?: string;
  source?: string;
  textHash: string;
  images?: IQuestionImage[];
  createdAt: Date;
}

/** Generate a stable hash from question text + options for dedup */
export function questionHash(text: string, optA: string, optB: string, optC: string): string {
  const normalized = [text, optA, optB, optC]
    .map((s) => s.replace(/\s+/g, " ").trim().toLowerCase())
    .join("|");
  return crypto.createHash("sha256").update(normalized).digest("hex").substring(0, 16);
}

const QuestionSchema = new Schema<IQuestion>({
  text: { type: String, required: true },
  optionA: { type: String, required: true },
  optionB: { type: String, required: true },
  optionC: { type: String, required: true },
  correctAnswer: { type: String, required: true, enum: ["A", "B", "C"] },
  topic: { type: String, required: true, enum: TOPICS, index: true },
  explanation: { type: String },
  source: { type: String },
  textHash: { type: String, index: true, unique: true },
  images: [
    {
      data: { type: String },
      contentType: { type: String, default: "image/png" },
      location: { type: String, enum: ["question", "explanation"], default: "explanation" },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

export const Question =
  mongoose.models.Question || mongoose.model<IQuestion>("Question", QuestionSchema);
