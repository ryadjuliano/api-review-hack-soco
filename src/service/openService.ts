import { Configuration, OpenAIApi } from "openai";
import dotenv from "dotenv";

dotenv.config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

export const summarizeReviews = async (reviews: string[]): Promise<string> => {
  try {
    const prompt = `Summarize these product reviews into key points:\n\n${reviews.join(
      "\n"
    )}`;

    const response = await openai.createCompletion({
      model: "gpt-3.5-turbo",
      prompt,
      max_tokens: 150,
    });

    return response.data.choices[0].text?.trim() || "No summary generated.";
  } catch (error) {
    console.error("OpenAI Error:", error);
    return "Error generating summary.";
  }
};
