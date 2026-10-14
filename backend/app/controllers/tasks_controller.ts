import type { HttpContext } from '@adonisjs/core/http'
import Task from '#models/task'
import { updateTaskValidator } from '#validators/task'

export default class TasksController {
  // GET and POST
  async index({ response }: HttpContext) {
    return response.ok({ message: 'GET endpoint ready' })
  }

  async store({ response }: HttpContext) {
    return response.ok({ message: 'POST endpoint ready' })
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

