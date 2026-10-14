import type { HttpContext } from '@adonisjs/core/http'
import Task from '#models/task'
import { DateTime } from 'luxon'

export default class TasksController {
  /**
   * Fetch and filter tasks
   * GET /tasks?status=completed&priority=high&overdue=true
   */
  async index({ request, response }: HttpContext) {
    const { status, priority, overdue } = request.qs()

    const query = Task.query()

    // Filter by status (e.g., 'pending', 'completed')
    if (status) {
      query.where('status', status)
    }

    // Filter by priority (e.g., 'low', 'medium', 'high')
    if (priority) {
      query.where('priority', priority)
    }

    // Filter for overdue tasks (due date is in the past and not completed)
    if (overdue === 'true') {
      query.where('dueDate', '<', DateTime.now().toSQL()).andWhereNot('status', 'completed')
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
  async update({ response }: HttpContext) {
    return response.ok({ message: 'PATCH endpoint ready' })
  }

  /**
   * Safely delete a task
   * DELETE /tasks/:id
   */
  async destroy({ params, response, auth }: HttpContext) {
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
