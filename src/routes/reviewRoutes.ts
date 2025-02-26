import { Router } from "express";
import { summarizeReviews } from "../services/openService";

const router = Router();

// Dummy reviews data
const dummyReviews = [
  { id: 1, product: "Laptop", review: "Great performance, but battery life is short." },
  { id: 2, product: "Laptop", review: "Amazing screen and fast processor!" },
  { id: 3, product: "Laptop", review: "Good value for money, but the keyboard is not comfortable." }
];

// API to get summarized reviews
router.get("/summary", async (req, res) => {
  try {
    const reviewsText = dummyReviews.map((r) => r.review);
    const summary = await summarizeReviews(reviewsText);
    res.json({ summary });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

// API to get raw reviews
router.get("/", (req, res) => {
  res.json(dummyReviews);
});

export default router;
