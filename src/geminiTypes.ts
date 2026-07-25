export type FunctionCall = {
  name: string;
  args?: Record<string, unknown>;
  id?: string;
};

export type GeminiPart =
  | { text: string }
  | { functionCall: FunctionCall }
  | {
      functionResponse: {
        name: string;
        response: Record<string, unknown>;
        id?: string;
      };
    };

export type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

export type ApiResponse = {
  candidates?: Array<{
    content?: GeminiContent;
  }>;
};

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;
