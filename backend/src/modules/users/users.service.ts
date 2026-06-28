import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const exists = await this.usersRepo.findOne({
      where: { email: dto.email },
    });
    if (exists) {
      throw new ConflictException('Bu e-posta zaten kayıtlı.');
    }

    const user = this.usersRepo.create({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      role: dto.role,
      isActive: dto.isActive ?? true,
      passwordHash: await bcrypt.hash(dto.password, SALT_ROUNDS),
    });
    return this.usersRepo.save(user);
  }

  findAll(): Promise<User[]> {
    return this.usersRepo.find({ order: { fullName: 'ASC' } });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Personel bulunamadı.');
    }
    return user;
  }

  /** Kimlik doğrulama için: bulunamazsa hata fırlatmaz, null döner. */
  findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  /** Parolayı da içerecek şekilde getirir (yalnızca kimlik doğrulama için). */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    const { password, ...rest } = dto;
    Object.assign(user, rest);
    if (password) {
      user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    }
    return this.usersRepo.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.usersRepo.softRemove(user);
  }

  static verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
