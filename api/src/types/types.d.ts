interface user {
  id: number;
  email: string;
  username: string;
}

declare namespace Express {
  export interface Request {
    user: user;
  }
  export interface Response {
    user: user;
  }
}
