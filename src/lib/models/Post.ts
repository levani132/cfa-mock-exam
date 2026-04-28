import mongoose, { Schema, Document } from "mongoose";

export interface IPost extends Document {
  userId: number;
  userName: string;
  content: string;
  likes: number;
  likedBy: number[]; // Array of user IDs who liked this post
  createdAt: Date;
  updatedAt: Date;
}

const PostSchema = new Schema<IPost>(
  {
    userId: { type: Number, required: true, index: true },
    userName: { type: String, required: true },
    content: { type: String, required: true, maxlength: 5000 },
    likes: { type: Number, default: 0 },
    likedBy: { type: [Number], default: [] },
  },
  { timestamps: true }
);

export const Post = mongoose.models.Post || mongoose.model<IPost>("Post", PostSchema);
