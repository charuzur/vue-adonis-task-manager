# API Contract & Data Model

## The Task Object
This is the exact JSON structure the AdonisJS backend will return and expect. Dummy data below was used in building the Vue UI immediately.

```json
{
  "id": 1,
  "title": "Setup GitHub Repository",
  "description": "Initialize the AdonisJS and Vue.js projects and push to main.",
  "status": "In Progress", 
  "priority": "High", 
  "due_date": "2026-10-16T23:59:59.000Z",
  "created_at": "2026-10-13T02:00:00.000Z",
  "updated_at": "2026-10-13T02:00:00.000Z"
}

Note: title is the ONLY required field for creation. description, due_date, and priority are optional. status will default to "To Do".



Endpoints Overview
•	Assigned - Charles
    o	GET /tasks -> Returns an array of Task objects.
    o	POST /tasks -> Requires title. Returns the newly created Task.

•	Assigned - Rey
    o	PATCH /tasks/:id -> Accepts optional updates. Returns the updated Task.

•	Assigned - Clint
    o	DELETE /tasks/:id -> Deletes the task. Returns { "message": "Task deleted" }.

    


