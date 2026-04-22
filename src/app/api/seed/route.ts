import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Question, TOPICS } from "@/lib/models/Question";

// Seed sample questions
export async function POST(req: NextRequest) {
  try {
    const password = req.headers.get("x-admin-password");
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const existingCount = await Question.countDocuments();
    if (existingCount > 0) {
      return NextResponse.json({
        message: `Database already has ${existingCount} questions. Skipping seed.`,
        count: existingCount,
      });
    }

    const sampleQuestions = getSampleQuestions();
    const result = await Question.insertMany(sampleQuestions);

    return NextResponse.json({ inserted: result.length });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    await connectDB();
    const counts: Record<string, number> = {};
    for (const topic of TOPICS) {
      counts[topic] = await Question.countDocuments({ topic });
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return NextResponse.json({ total, byTopic: counts });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function getSampleQuestions() {
  return [
    // Ethics (5 questions)
    {
      text: "According to the CFA Institute Code of Ethics, members must place the integrity of the investment profession and the interests of clients above their own personal interests. Which of the following actions would most likely violate this principle?",
      optionA: "Disclosing conflicts of interest to clients before engaging in transactions",
      optionB: "Trading in a personal account before executing a similar trade for a client",
      optionC: "Providing investment advice that is suitable for the client's risk tolerance",
      correctAnswer: "B",
      topic: "Ethical and Professional Standards",
      explanation: "Front-running (trading ahead of clients) violates the duty to place client interests first. Standard VI(B) - Priority of Transactions requires that client trades take priority over personal trades.",
      source: "Sample Questions",
    },
    {
      text: "A CFA charterholder discovers that her firm's compliance procedures are inadequate. According to Standard I(A) - Knowledge of the Law, she should most appropriately:",
      optionA: "Immediately resign from the firm",
      optionB: "Report the inadequacy to her supervisor and recommend corrective action",
      optionC: "Ignore the issue since it is the firm's responsibility, not hers",
      correctAnswer: "B",
      topic: "Ethical and Professional Standards",
      explanation: "Standard I(A) requires members to understand applicable laws and regulations. When non-compliance is identified, the first step is to report to a supervisor and seek correction, not immediately resign.",
      source: "Sample Questions",
    },
    {
      text: "Under Standard III(A) - Loyalty, Prudence, and Care, a portfolio manager's fiduciary duty requires acting for the benefit of:",
      optionA: "The portfolio manager's employing firm",
      optionB: "The clients who have entrusted their assets",
      optionC: "The regulatory authorities overseeing the investment industry",
      correctAnswer: "B",
      topic: "Ethical and Professional Standards",
      explanation: "Standard III(A) establishes that portfolio managers owe a fiduciary duty to their clients, meaning they must act in the best interests of those who have entrusted them with their assets.",
      source: "Sample Questions",
    },
    {
      text: "Which of the following is least likely a requirement under the CFA Institute's Standards of Professional Conduct?",
      optionA: "Maintaining knowledge and complying with applicable laws",
      optionB: "Guaranteeing a minimum rate of return to clients",
      optionC: "Exercising diligence and thoroughness in making investment recommendations",
      correctAnswer: "B",
      topic: "Ethical and Professional Standards",
      explanation: "The CFA Standards never require guaranteeing returns. Such guarantees would be misleading and violate Standard I(C) - Misrepresentation.",
      source: "Sample Questions",
    },
    {
      text: "A research analyst copies statistical data from a widely recognized financial database and includes it in her report without attribution. According to Standard I(C) - Misrepresentation, this action is:",
      optionA: "Acceptable because widely available data does not need attribution",
      optionB: "A violation because all sources must be properly referenced",
      optionC: "Acceptable only if the data is publicly available at no cost",
      correctAnswer: "B",
      topic: "Ethical and Professional Standards",
      explanation: "Standard I(C) requires proper attribution of all sources used in research. Even widely available data should be cited to avoid misrepresentation of the analyst's work.",
      source: "Sample Questions",
    },
    // Quantitative Methods (3 questions)
    {
      text: "An investment has a 60% probability of earning a 10% return and a 40% probability of losing 5%. What is the expected return?",
      optionA: "4.0%",
      optionB: "5.0%",
      optionC: "6.0%",
      correctAnswer: "A",
      topic: "Quantitative Methods",
      explanation: "Expected return = (0.60 × 10%) + (0.40 × -5%) = 6% - 2% = 4.0%",
      source: "Sample Questions",
    },
    {
      text: "A sample of 25 observations has a mean of 50 and a standard deviation of 10. The standard error of the sample mean is closest to:",
      optionA: "0.4",
      optionB: "2.0",
      optionC: "5.0",
      correctAnswer: "B",
      topic: "Quantitative Methods",
      explanation: "Standard error = s / √n = 10 / √25 = 10 / 5 = 2.0",
      source: "Sample Questions",
    },
    {
      text: "Which of the following is the most appropriate measure of central tendency for a dataset with extreme outliers?",
      optionA: "Arithmetic mean",
      optionB: "Median",
      optionC: "Geometric mean",
      correctAnswer: "B",
      topic: "Quantitative Methods",
      explanation: "The median is resistant to outliers because it represents the middle value regardless of extreme observations. The arithmetic mean is heavily influenced by outliers.",
      source: "Sample Questions",
    },
    // Economics (3 questions)
    {
      text: "If the central bank increases the money supply while the economy is at full employment, the most likely result in the long run is:",
      optionA: "An increase in real GDP with stable prices",
      optionB: "An increase in the general price level with no change in real GDP",
      optionC: "A decrease in both the price level and real GDP",
      correctAnswer: "B",
      topic: "Economics",
      explanation: "According to the quantity theory of money, at full employment, an increase in money supply leads to proportional increases in the price level with no long-run effect on real output.",
      source: "Sample Questions",
    },
    {
      text: "A country's currency is most likely to appreciate when:",
      optionA: "Its inflation rate is higher than that of its trading partners",
      optionB: "Its real interest rates increase relative to its trading partners",
      optionC: "Its government runs a larger fiscal deficit",
      correctAnswer: "B",
      topic: "Economics",
      explanation: "Higher real interest rates attract foreign capital inflows, increasing demand for the domestic currency and causing it to appreciate.",
      source: "Sample Questions",
    },
    {
      text: "In a perfectly competitive market, a firm maximizes profit by producing the quantity where:",
      optionA: "Total revenue is maximized",
      optionB: "Marginal revenue equals marginal cost",
      optionC: "Average total cost is minimized",
      correctAnswer: "B",
      topic: "Economics",
      explanation: "Profit maximization in any market structure occurs where marginal revenue equals marginal cost (MR = MC).",
      source: "Sample Questions",
    },
    // Financial Statement Analysis (3 questions)
    {
      text: "A company reports revenue of $500,000, cost of goods sold of $300,000, and operating expenses of $100,000. The gross profit margin is closest to:",
      optionA: "20%",
      optionB: "40%",
      optionC: "60%",
      correctAnswer: "B",
      topic: "Financial Statement Analysis",
      explanation: "Gross profit = Revenue - COGS = $500,000 - $300,000 = $200,000. Gross profit margin = $200,000 / $500,000 = 40%.",
      source: "Sample Questions",
    },
    {
      text: "Under IFRS, which of the following inventory cost methods is NOT permitted?",
      optionA: "First-in, first-out (FIFO)",
      optionB: "Last-in, first-out (LIFO)",
      optionC: "Weighted average cost",
      correctAnswer: "B",
      topic: "Financial Statement Analysis",
      explanation: "IFRS does not permit the use of LIFO for inventory valuation. LIFO is allowed under US GAAP but prohibited under IFRS (IAS 2).",
      source: "Sample Questions",
    },
    {
      text: "A company's current ratio is 2.0 and its quick ratio is 0.8. This most likely indicates that the company:",
      optionA: "Has strong overall liquidity with adequate cash reserves",
      optionB: "Relies heavily on inventory to meet its current obligations",
      optionC: "Has low levels of accounts receivable relative to current liabilities",
      correctAnswer: "B",
      topic: "Financial Statement Analysis",
      explanation: "A large difference between current ratio and quick ratio indicates significant inventory. The quick ratio excludes inventory, so a low quick ratio relative to the current ratio means inventory is a large proportion of current assets.",
      source: "Sample Questions",
    },
    // Corporate Issuers (2 questions)
    {
      text: "A company's weighted average cost of capital (WACC) is most appropriately used as the discount rate for a project when the project:",
      optionA: "Has the same risk as the company's existing operations",
      optionB: "Is financed entirely with equity",
      optionC: "Has higher risk than the company's average project",
      correctAnswer: "A",
      topic: "Corporate Issuers",
      explanation: "WACC is appropriate as a discount rate when the project's risk is similar to the average risk of the firm's existing operations. Higher or lower risk projects should use adjusted rates.",
      source: "Sample Questions",
    },
    {
      text: "According to the pecking order theory, a company will prefer to finance new investments first with:",
      optionA: "Newly issued equity",
      optionB: "Internal funds (retained earnings)",
      optionC: "Long-term debt",
      correctAnswer: "B",
      topic: "Corporate Issuers",
      explanation: "The pecking order theory states firms prefer internal financing first, then debt, and finally equity as a last resort, due to information asymmetry costs.",
      source: "Sample Questions",
    },
    // Equity Investments (3 questions)
    {
      text: "A stock has a beta of 1.5, the risk-free rate is 3%, and the expected market return is 9%. Using the CAPM, the required return on the stock is:",
      optionA: "10.5%",
      optionB: "12.0%",
      optionC: "13.5%",
      correctAnswer: "B",
      topic: "Equity Investments",
      explanation: "CAPM: Required return = Rf + β(Rm - Rf) = 3% + 1.5(9% - 3%) = 3% + 9% = 12.0%",
      source: "Sample Questions",
    },
    {
      text: "An equity index that is weighted by the market capitalization of its constituent stocks will be most affected by price changes in:",
      optionA: "The smallest companies in the index",
      optionB: "The largest companies in the index",
      optionC: "All companies equally",
      correctAnswer: "B",
      topic: "Equity Investments",
      explanation: "In a market-cap weighted index, larger companies have a greater weight and therefore their price changes have a proportionally larger impact on the index value.",
      source: "Sample Questions",
    },
    {
      text: "A company has earnings per share of $4.00 and a P/E ratio of 15. If earnings grow by 10% and the P/E ratio remains constant, the expected stock price is closest to:",
      optionA: "$60.00",
      optionB: "$64.00",
      optionC: "$66.00",
      correctAnswer: "C",
      topic: "Equity Investments",
      explanation: "New EPS = $4.00 × 1.10 = $4.40. Stock price = P/E × EPS = 15 × $4.40 = $66.00",
      source: "Sample Questions",
    },
    // Fixed Income (3 questions)
    {
      text: "A bond's duration is 5.0 years and its convexity is 30. If yields increase by 100 basis points, the approximate percentage price change is closest to:",
      optionA: "-4.85%",
      optionB: "-5.00%",
      optionC: "-5.15%",
      correctAnswer: "A",
      topic: "Fixed Income",
      explanation: "Price change ≈ -Duration × ΔY + 0.5 × Convexity × (ΔY)² = -5.0 × 0.01 + 0.5 × 30 × (0.01)² = -0.05 + 0.0015 = -0.0485 = -4.85%",
      source: "Sample Questions",
    },
    {
      text: "Which of the following bonds is most likely to have the highest interest rate risk?",
      optionA: "A 5-year bond with a 6% coupon rate",
      optionB: "A 10-year zero-coupon bond",
      optionC: "A 10-year bond with an 8% coupon rate",
      correctAnswer: "B",
      topic: "Fixed Income",
      explanation: "Zero-coupon bonds have the highest duration (and thus interest rate risk) for a given maturity because there are no intermediate cash flows. Duration equals maturity for zero-coupon bonds.",
      source: "Sample Questions",
    },
    {
      text: "The yield spread between a corporate bond and a government bond of similar maturity primarily compensates the investor for:",
      optionA: "Interest rate risk only",
      optionB: "Credit risk, liquidity risk, and other factors",
      optionC: "Inflation risk only",
      correctAnswer: "B",
      topic: "Fixed Income",
      explanation: "The yield spread (credit spread) compensates investors for credit risk (default risk), liquidity risk, and other factors specific to the corporate issuer.",
      source: "Sample Questions",
    },
    // Derivatives (2 questions)
    {
      text: "A European call option on a stock is most likely to increase in value when:",
      optionA: "The stock price decreases and volatility decreases",
      optionB: "The stock price increases and volatility increases",
      optionC: "The risk-free rate decreases and time to expiration decreases",
      correctAnswer: "B",
      topic: "Derivatives",
      explanation: "Call option value increases with higher underlying price (positive delta) and higher volatility (positive vega).",
      source: "Sample Questions",
    },
    {
      text: "At expiration, the payoff of a long position in a put option with a strike price of $50 when the underlying is trading at $42 is:",
      optionA: "$0",
      optionB: "$8",
      optionC: "$42",
      correctAnswer: "B",
      topic: "Derivatives",
      explanation: "Put payoff at expiration = max(0, Strike - Underlying) = max(0, $50 - $42) = $8",
      source: "Sample Questions",
    },
    // Alternative Investments (2 questions)
    {
      text: "Compared to traditional investments, alternative investments are most likely characterized by:",
      optionA: "Higher liquidity and lower fees",
      optionB: "Lower liquidity and higher fees",
      optionC: "Similar liquidity and similar fees",
      correctAnswer: "B",
      topic: "Alternative Investments",
      explanation: "Alternative investments (hedge funds, PE, real estate) generally have lower liquidity, longer lock-up periods, and higher management and performance fees compared to traditional investments.",
      source: "Sample Questions",
    },
    {
      text: "A real estate investment that generates rental income is best classified as:",
      optionA: "Core real estate with relatively stable cash flows",
      optionB: "Opportunistic real estate with high development risk",
      optionC: "Distressed real estate requiring significant renovation",
      correctAnswer: "A",
      topic: "Alternative Investments",
      explanation: "Core real estate investments are characterized by stable, income-generating properties (e.g., established office buildings, apartments) with lower risk and more predictable cash flows.",
      source: "Sample Questions",
    },
    // Portfolio Management (2 questions)
    {
      text: "According to Modern Portfolio Theory, the benefit of diversification is greatest when the correlation between assets is:",
      optionA: "+1.0",
      optionB: "0.0",
      optionC: "-1.0",
      correctAnswer: "C",
      topic: "Portfolio Management",
      explanation: "Diversification benefit is maximized when correlation is -1.0. At perfect negative correlation, it's theoretically possible to create a zero-risk portfolio from two risky assets.",
      source: "Sample Questions",
    },
    {
      text: "An investor's investment policy statement (IPS) should least likely include:",
      optionA: "The investor's return objectives and risk tolerance",
      optionB: "Specific securities to be purchased in the portfolio",
      optionC: "The investor's time horizon and liquidity needs",
      correctAnswer: "B",
      topic: "Portfolio Management",
      explanation: "An IPS outlines the investor's objectives, constraints, and guidelines but does not specify individual securities. Security selection is part of the implementation process that follows the IPS.",
      source: "Sample Questions",
    },
  ];
}
