FROM node:stable

WORKDIR /api

COPY ./api .

RUN npm install

EXPOSE 3000

CMD ["npm", "run", "start"]
