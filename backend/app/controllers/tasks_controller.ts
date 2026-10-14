import type { HttpContext } from '@adonisjs/core/http'

export default class TasksController {
  // GET and POST
  async index({ response }: HttpContext) {
    return response.ok({ message: 'GET endpoint ready' })
  }

  async store({ response }: HttpContext) {
    return response.ok({ message: 'POST endpoint ready' })
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
