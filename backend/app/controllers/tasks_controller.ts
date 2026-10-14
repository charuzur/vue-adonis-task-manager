import type { HttpContext } from '@adonisjs/core/http'
import Task from '#models/task'
import { updateTaskValidator } from '#validators/task'

export default class TasksController {
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
}