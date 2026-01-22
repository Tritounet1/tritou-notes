FROM node:stable

WORKDIR /app

COPY ./app .

RUN npm install

CMD ["npm", "run", "build"]

FROM nginx:stable

EXPOSE 5173
