import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { ExpensesService } from './expenses.service';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  CreateProjectDto,
  QueryExpenseDto,
  UpdateExpenseCategoryDto,
  UpdateExpenseDto,
  UpdateProjectDto,
} from './dto/expense.dto';

/** Gider yönetimi — yalnızca İşletme Sahibi (OWNER). */
@ApiTags('expenses')
@ApiBearerAuth()
@Roles(UserRole.OWNER)
@Controller({ version: '1' })
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  // ── Gider türleri ──
  @Get('expense-categories')
  listCategories() {
    return this.service.listCategories();
  }
  @Post('expense-categories')
  createCategory(@Body() dto: CreateExpenseCategoryDto) {
    return this.service.createCategory(dto);
  }
  @Patch('expense-categories/:id')
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ) {
    return this.service.updateCategory(id, dto);
  }
  @Delete('expense-categories/:id')
  removeCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeCategory(id);
  }

  // ── İş / Proje ──
  @Get('projects')
  listProjects() {
    return this.service.listProjects();
  }
  @Post('projects')
  createProject(@Body() dto: CreateProjectDto) {
    return this.service.createProject(dto);
  }
  @Patch('projects/:id')
  updateProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.service.updateProject(id, dto);
  }
  @Delete('projects/:id')
  removeProject(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeProject(id);
  }

  // ── Giderler ──
  @Get('expenses')
  findExpenses(@Query() query: QueryExpenseDto) {
    return this.service.findExpenses(query);
  }
  @Get('expenses/summary')
  summary(@Query() query: QueryExpenseDto) {
    return this.service.summary(query);
  }
  @Post('expenses')
  createExpense(@Body() dto: CreateExpenseDto) {
    return this.service.createExpense(dto);
  }
  @Patch('expenses/:id')
  updateExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.service.updateExpense(id, dto);
  }
  @Delete('expenses/:id')
  removeExpense(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeExpense(id);
  }
}
