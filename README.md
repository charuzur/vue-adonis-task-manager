# Team To-Do List Application

A full-stack task management application designed to help users capture tasks, organize priorities, and track progress. Built collaboratively for the Intern Final Project.

## Project Architecture

* **Frontend:** Vue.js configured with Vite and styled using Tailwind CSS v4.
* **Backend:** AdonisJS for handling API routing, application logic, and request validation.
* **Database:** PostgreSQL for persistent data storage using Lucid ORM.

## Prerequisites

Before running this project, ensure you have the following installed on your local machine:
* [Node.js](https://nodejs.org/) (v24 or higher required)
* [PostgreSQL](https://www.postgresql.org/) (Running locally)
* Git

## Local Setup Instructions

### 1. Clone the Repository
```bash
git clone [https://github.com/your-username/vue-adonis-task-manager.git](https://github.com/your-username/vue-adonis-task-manager.git)
cd vue-adonis-task-manager
```

### 2. Backend Setup (AdonisJS & PostgreSQL)
Open a terminal and navigate to the backend directory:
```bash
cd backend
npm install
```

Environment Variables:
Duplicate the example environment file and configure your local database credentials:
```bash
cp .env.example .env
```
Ensure your .env file contains the correct PostgreSQL connection details:
```bash
DB_CONNECTION=pg
PG_HOST=localhost
PG_PORT=5432
PG_USER=your_postgres_user
PG_PASSWORD=your_postgres_password
PG_DB_NAME=task_manager_db
```
Database Migrations:
Execute the following command to generate the required database tables:
```bash
node ace migration:run
```
Start the Backend Server:
```bash
npm run dev
```
The AdonisJS API will run on http://localhost:3333.

### 3. Frontend Setup (Vue.js)
Open a new terminal window and navigate to the frontend directory:
```bash
cd frontend
npm install
```
Start the Frontend Server:
```bash
npm run dev
```
The Vue.js application will run on http://localhost:5173.

### API Endpoints
The backend exposes the following RESTful routes:

* GET /tasks - Retrieve all tasks
* POST /tasks - Create a new task (Requires title, optional description, due_date, priority)
* PATCH /tasks/:id - Update an existing task's details or status
* DELETE /tasks/:id - Permanently remove a task

### Team Workflow & Collaboration
This project was built using strict Agile methodologies:

* Feature Branching: All features were developed in isolated branches and tested locally.
* Pull Requests: Code was reviewed by peers before merging into the main branch.
* Separation of Concerns: Clear boundaries were maintained between API logic, database schemas, and client-side UI.