import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  numericId: number;
  name: string;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  numericId: { type: Number, required: true, unique: true, index: true },
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
