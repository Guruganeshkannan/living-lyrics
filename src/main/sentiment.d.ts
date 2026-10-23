declare module 'sentiment' {
  interface AnalysisResult {
    score: number
    comparative: number
    tokens: string[]
    positive: string[]
    negative: string[]
  }
  export default class Sentiment {
    analyze(phrase: string): AnalysisResult
  }
}
