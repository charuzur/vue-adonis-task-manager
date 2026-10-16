/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
const TasksController = () => import('#controllers/tasks_controller')

// GET and POST
router.get('/tasks', [TasksController, 'index'])
router.post('/tasks', [TasksController, 'store'])

// PATCH
router.group(() => {
  router.patch('tasks/:id', [TasksController, 'update']).where('id', router.matchers.number())
})

// DELETE
router.delete('/tasks/:id', [TasksController, 'destroy'])
