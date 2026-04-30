import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  numericId: number;
  name: string;
  passwordHash?: string;
  answeredQuestions: string[]; // kept for backward compat during migration
  completedCycles: number; // kept for backward compat during migration
  questionAttempts: Map<string, number>; // { questionId: timesAnswered }
  createdAt: Date;
  profilePicture?: string; // URL or base64
  coverPicture?: string; // URL or base64
  description?: string; // Bio/description
}

const UserSchema = new Schema<IUser>({
  numericId: { type: Number, required: true, unique: true, index: true },
  name: { type: String, required: true },
  passwordHash: { type: String },
  answeredQuestions: { type: [String], default: [] },
  completedCycles: { type: Number, default: 0 },
  questionAttempts: { type: Map, of: Number, default: () => new Map() },
  createdAt: { type: Date, default: Date.now },
  profilePicture: { type: String },
  coverPicture: { type: String },
  description: { type: String, maxlength: 500 },
});

export const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
