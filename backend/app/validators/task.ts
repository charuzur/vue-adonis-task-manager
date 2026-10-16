import vine from '@vinejs/vine'

export const updateTaskValidator = vine.create({
  title: vine.string().trim().minLength(1).maxLength(255).optional(),
  description: vine.string().trim().nullable().optional(),
  due_date: vine.date({formats:['iso8601']}).nullable().optional(),
  priority: vine.enum(['Low', 'Medium', 'High']).nullable().optional(),
  status: vine.enum(['To Do', 'In Progress', 'Completed']).optional(),
})