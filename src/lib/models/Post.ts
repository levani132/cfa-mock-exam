import mongoose, { Schema, Document } from "mongoose";

export interface IComment {
  _id: string;
  userId: number;
  userName: string;
  content: string;
  createdAt: Date;
}

export interface IPost extends Document {
  userId: number;
  userName: string;
  content: string;
  likes: number;
  likedBy: number[];
  comments: IComment[];
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    userId: { type: Number, required: true },
    userName: { type: String, required: true },
    content: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true, _id: true }
);

const PostSchema = new Schema<IPost>(
  {
    userId: { type: Number, required: true, index: true },
    userName: { type: String, required: true },
    content: { type: String, required: true, maxlength: 5000 },
    likes: { type: Number, default: 0 },
    likedBy: { type: [Number], default: [] },
    comments: { type: [CommentSchema], default: [] },
  },
  { timestamps: true }
);

export const Post = mongoose.models.Post || mongoose.model<IPost>("Post", PostSchema);
