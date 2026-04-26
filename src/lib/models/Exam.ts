import mongoose, { Schema, Document } from "mongoose";
import type { Topic } from "./Question";

export interface ExamConfig {
  mode: "full" | "custom" | "mock";
  mockExamId?: string;
  topics: Topic[];
  totalQuestions: number;
  timeLimitMinutes: number;
  canPauseTimer: boolean;
  showCorrectAnswers: boolean;
}

export interface ExamAnswer {
  questionId: string;
  selected: "A" | "B" | "C" | null;
  correct: "A" | "B" | "C";
  isCorrect: boolean;
  topic: string;
}

export interface TopicScore {
  topic: string;
  correct: number;
  total: number;
  percentage: number;
}

export interface IExam extends Document {
  userId: number;
  config: ExamConfig;
  questionIds: string[];
  answers: ExamAnswer[];
  score: number;
  totalQuestions: number;
  percentage: number;
  topicBreakdown: TopicScore[];
  startedAt: Date;
  completedAt?: Date;
  timeSpentSeconds?: number;
}

const ExamSchema = new Schema<IExam>({
  userId: { type: Number, required: true, index: true },
  config: {
    mode: { type: String, required: true, enum: ["full", "custom", "mock"] },
    mockExamId: { type: String },
    topics: [{ type: String }],
    totalQuestions: { type: Number, required: true },
    timeLimitMinutes: { type: Number, required: true },
    canPauseTimer: { type: Boolean, default: false },
    showCorrectAnswers: { type: Boolean, default: false },
  },
  questionIds: [{ type: String }],
  answers: [
    {
      questionId: String,
      selected: String,
      correct: String,
      isCorrect: Boolean,
      topic: String,
    },
  ],
  score: { type: Number, default: 0 },
  totalQuestions: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  topicBreakdown: [
    {
      topic: String,
      correct: Number,
      total: Number,
      percentage: Number,
    },
  ],
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  timeSpentSeconds: { type: Number },
});

export const Exam = mongoose.models.Exam || mongoose.model<IExam>("Exam", ExamSchema);
