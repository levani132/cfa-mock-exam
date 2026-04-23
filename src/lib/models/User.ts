import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  numericId: number;
  name: string;
  passwordHash?: string;
  answeredQuestions: string[];
  completedCycles: number;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  numericId: { type: Number, required: true, unique: true, index: true },
  name: { type: String, required: true },
  passwordHash: { type: String },
  answeredQuestions: { type: [String], default: [] },
  completedCycles: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
