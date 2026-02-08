interface user {
  id: number;
  email: string;
  username: string;
  role: string;
}

declare namespace Express {
  export interface Request {
    user: user;
  }
  export interface Response {
    user: user;
  }
}
