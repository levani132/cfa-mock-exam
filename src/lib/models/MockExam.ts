import mongoose, { Schema, Document } from "mongoose";

export interface IMockExam extends Document {
  name: string;
  source: string;
  questionIds: mongoose.Types.ObjectId[];
  totalQuestions: number;
  timeLimitMinutes: number;
  createdAt: Date;
}

const MockExamSchema = new Schema<IMockExam>({
  name: { type: String, required: true, unique: true },
  source: { type: String, required: true },
  questionIds: [{ type: Schema.Types.ObjectId, ref: "Question" }],
  totalQuestions: { type: Number, required: true },
  timeLimitMinutes: { type: Number, default: 270 },
  createdAt: { type: Date, default: Date.now },
});

export const MockExam =
  mongoose.models.MockExam || mongoose.model<IMockExam>("MockExam", MockExamSchema);
