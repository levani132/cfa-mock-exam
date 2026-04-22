import mongoose, { Schema, Document } from "mongoose";

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

export interface IQuestion extends Document {
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  correctAnswer: "A" | "B" | "C";
  topic: Topic;
  explanation?: string;
  source?: string;
  createdAt: Date;
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
  createdAt: { type: Date, default: Date.now },
});

export const Question =
  mongoose.models.Question || mongoose.model<IQuestion>("Question", QuestionSchema);
