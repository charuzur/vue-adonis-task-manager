import router from '@adonisjs/core/services/router'
const TasksController = () => import('#controllers/tasks_controller')

// GET and POST
router.get('/tasks', [TasksController, 'index'])
router.post('/tasks', [TasksController, 'store'])

// PATCH
router.patch('/tasks/:id', [TasksController, 'update'])

// DELETE
router.delete('/tasks/:id', [TasksController, 'destroy'])
