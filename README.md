```markdown
# Team To-Do List Application 

## Prerequisites 
* Node.js installed 
* PostgreSQL installed and running 

## 1. Backend Setup (AdonisJS) 
1. Navigate to the backend folder: `cd backend` 
2. Install dependencies: `npm install` 
3. Copy the environment file: `cp .env.example .env` 
4. Update `.env` with your local PostgreSQL credentials (DB_USER, DB_PASSWORD, DB_DATABASE). 
5. Run the database migrations to build the tasks table: `node ace migration:run` 
6. Start the development server: `npm run dev` 
   * API runs on `http://localhost:3333` 

## 2. Frontend Setup (Vue.js) 
1. Open a new terminal and navigate to the frontend folder: `cd frontend` 
2. Install dependencies: `npm install` 
3. Start the Vite server: `npm run dev` 
   * Vue app runs on `http://localhost:5173`