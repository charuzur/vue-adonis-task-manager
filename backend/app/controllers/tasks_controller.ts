import type { HttpContext } from '@adonisjs/core/http'
import Task from '#models/task'
import { DateTime } from 'luxon'
import { updateTaskValidator } from '#validators/task'

export default class TasksController {
  /**
   * Fetch and filter tasks
   * GET /tasks?status=completed&priority=high&overdue=true
   */
  async index({ request, response }: HttpContext) {
    const { status, priority, overdue, overdue_before: overdueBefore } = request.qs()

    const query = Task.query()

    // Filter by status (e.g., 'pending', 'completed')
    if (status) {
      query.where('status', status)
    }

    // Filter by priority; `none` represents tasks without an assigned priority.
    if (priority === 'none') {
      query.whereNull('priority')
    } else if (priority) {
      query.where('priority', priority)
    }

    // Use the browser's local calendar date so tasks due today are not overdue.
    if (overdue === 'true') {
      const parsedDate = DateTime.fromISO(String(overdueBefore || ''), { zone: 'utc' })
      const cutoff = (parsedDate.isValid ? parsedDate : DateTime.now()).startOf('day')
      query.where('dueDate', '<', cutoff.toSQL()).andWhereNot('status', 'Completed')
    }

    // Fetch tasks ordered by creation date
    const tasks = await query.orderBy('createdAt', 'desc')

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
  async update({ params, request, response }: HttpContext) {
    const task = await Task.findOrFail(params.id)

    const { due_date: dueDate, ...fields } = await request.validateUsing(updateTaskValidator)

    // TODO: Uncomment once task ownership is implemented
    // (also add `auth` to the destructured HttpContext above)
    // if (task.userId !== auth.user!.id) {
    //   return response.unauthorized({ message: 'You do not have permission to edit this task' })
    // }

    if (fields.status === 'Completed' && task.status !== 'Completed') {
      task.previousStatus = task.status
    } else if (task.status === 'Completed' && fields.status && fields.status !== 'Completed') {
      task.previousStatus = null
    }

    task.merge(fields)
    if (dueDate !== undefined) {
      task.dueDate = dueDate
    }
    await task.save()

    return response.ok(task.serialize())
  }

  /**
   * Safely delete a task
   * DELETE /tasks/:id
   */
  async destroy({ params, response }: HttpContext) {
    try {
      const task = await Task.findOrFail(params.id)

      // TODO: Uncomment once task ownership is implemented
      // if (task.userId !== auth.user!.id) {
      //   return response.unauthorized({ message: 'You do not have permission to delete this task' })
      // }

      await task.delete()

      return response.ok({
        message: 'Task deleted',
        taskId: task.id,
      })
    } catch (error) {
      return response.notFound({
        error: 'Task not found',
      })
    }
  }
}
