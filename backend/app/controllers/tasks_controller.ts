import type { HttpContext } from '@adonisjs/core/http'
import Task from '#models/task'

export default class TasksController {
  // GET and POST
  async index({ response }: HttpContext) {
    const tasks = await Task.query().orderBy('id', 'asc')
    return response.ok(tasks)
  }

  async store({ request, response }: HttpContext) {
    const payload = request.only(['title', 'description', 'due_date', 'priority', 'status'])

    // Enforce API Contract
    if (!payload.title) {
      return response.badRequest({ message: 'Title is required' })
    }

    // Default status if none provided by the frontend
    if (!payload.status) {
      payload.status = 'To Do'
    }

    const task = await Task.create(payload)
    return response.created(task)
  }

  // PATCH
  async update({ response }: HttpContext) {
    return response.ok({ message: 'PATCH endpoint ready' })
  }

  // DELETE
  async destroy({ response }: HttpContext) {
    return response.ok({ message: 'DELETE endpoint ready' })
  }
}
