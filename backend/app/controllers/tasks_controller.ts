import type { HttpContext } from '@adonisjs/core/http'
import Task from '#models/task'
import {updateTaskValidator} from '#validators/task'

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
  async update({ params, request }: HttpContext) {
    const task  = await Task.findOrFail(params.id)
    const {due_date, ...fields} = await request.validateUsing(updateTaskValidator)

    task.merge(fields)
    if (due_date !== undefined) {
        task.dueDate = due_date
    }
    await task.save()

    return task.serialize()
  }

  // DELETE
  async destroy({ response }: HttpContext) {
    return response.ok({ message: 'DELETE endpoint ready' })
  }
}

